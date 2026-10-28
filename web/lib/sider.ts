// Bygger visningsmodellene for sidene fra rådata. Ren funksjon, så sidene og testene bruker samme kode.

import { buildHeat } from "./analyse/heatmap";
import { buildMonstre, sterkesteMonstre } from "./analyse/monstre";
import { forbered, type Raadata } from "./data/forbered";
import { buildRecommendations } from "./oversikt/anbefalinger";
import { buildConceptBlocks } from "./oversikt/konsepter";
import { freshGroups } from "./oversikt/ferske";
import { buildOversikt } from "./oversikt/periodemodell";
import { buildRecent } from "./oversikt/sist";
import { lesValg, perioder } from "./oversikt/valg";
import { addDays } from "./format";
import { fraInnboks, type InnboksRad } from "./plan/innboks";
import { fraView, type PlanRad } from "./plan/ukeplan";
import { PLAN_KONSEPTER } from "./regler/plan";
import { iValg, PLAN_PLATTFORMER, PLATTFORM_VALG, plattformValg } from "./regler/plattformer";

export const plattformOptions = () => PLATTFORM_VALG.map((p) => ({ key: p.key, label: p.label }));

type Params = Record<string, string | string[] | undefined>;

export function oversiktSide(raw: Raadata, params: Params, today: string) {
  const valg = lesValg(params, today);
  const f = forbered(raw, today);
  const v = valg.plattform;
  const sections = buildMonstre(f.features);
  return {
    valg: v,
    periodeKey: valg.periode.key,
    periodeLabel: valg.periode.label,
    plattformer: plattformOptions(),
    perioder: perioder(today).map((p) => ({ key: p.key, label: p.label })),
    model: buildOversikt(v, valg.periode, { series: f.series, content: f.content, listContent: f.listContent, followers: f.followers, total: f.total, takeover: f.takeover, today }),
    recs: buildRecommendations(f.concepts, f.listContent, today, true).blocks.filter((b) => iValg(v, b.platform, b.format)),
    patterns: sterkesteMonstre(sections.filter((s) => iValg(v, s.platform, s.format)), 3),
    fresh: freshGroups(f.listContent, true).filter((g) => iValg(v, g.platform, g.format)),
    recent: buildRecent(f.listContent, f.concepts, true).filter((r) => iValg(v, r.platform, r.format)),
  };
}

export function innholdsserierSide(raw: Raadata, params: Params, today: string) {
  const v = plattformValg(params.plattform);
  const f = forbered(raw, today);
  return {
    valg: v,
    plattformer: plattformOptions(),
    blocks: buildConceptBlocks(f.concepts, f.listContent, today, params.vis === "alle", true).filter((b) => iValg(v, b.platform, b.format)),
    recs: buildRecommendations(f.concepts, f.listContent, today, true).blocks.filter((b) => iValg(v, b.platform, b.format)),
    showBefore: params.vis === "alle",
  };
}

export type Visning = "monstre" | "heatmap" | "kalender";
const VISNINGER: Visning[] = ["monstre", "heatmap", "kalender"];

/**
 * plan: rader fra dashboard.planned_posts (null når viewet ikke finnes ennå), om brukeren er redaktør, og
 * Drive-innboksen (bare for redaktører; null når den ikke er hentet eller viewet mangler).
 */
export function publiseringstidSide(
  raw: Raadata,
  params: Params,
  today: string,
  plan: { rader: Record<string, unknown>[] | null; editor: boolean; innboks?: Record<string, unknown>[] | null } = { rader: null, editor: false },
) {
  const v = plattformValg(params.plattform);
  const f = forbered(raw, today);
  const visning: Visning = VISNINGER.find((x) => x === params.visning) ?? "monstre";
  const sections = buildMonstre(f.features).filter((s) => iValg(v, s.platform, s.format));
  // Heatmap per plattform og format i valget (Alle: Reels, Shorts og TikTok-video)
  const heat = PLATTFORM_VALG.find((x) => x.key === v.key)!
    .platforms.flatMap((p) => (v.formats[p] ?? []).filter((fm) => fm !== "PHOTO").map((fm) => buildHeat(f.content, p, fm)))
    .filter((h) => h.n > 0 || v.key === "instagram-feed");
  const concepts = [...new Set(heat.flatMap((h) => h.concepts))];
  const konsept = typeof params.konsept === "string" && concepts.includes(params.konsept) ? params.konsept : "alle";
  // Kalender: heatmap per planleggingsplattform, og nylige innlegg til oppfølging av tester
  const planHeat = Object.fromEntries(PLAN_PLATTFORMER.map((pp) => [pp.key, buildHeat(f.content, pp.platform, pp.format)]));
  const since = addDays(today, -120);
  const followContent = f.listContent
    .filter((r) => PLAN_PLATTFORMER.some((pp) => pp.platform === r.platform && pp.format === r.format) && r.published_at.slice(0, 10) >= since)
    .map((r) => ({ ...r, permalink: null, fetched_at: null, title: (r.title ?? "").split("\n")[0].slice(0, 120) }));
  // Typene innhold i utkastet: fast liste i konfigurasjonen (Folka Først blir «(fra 18.10)» automatisk).
  const planConcepts = [...PLAN_KONSEPTER];
  return {
    valg: v,
    plattformer: plattformOptions(),
    visning,
    sections,
    heat,
    konsept,
    concepts,
    planHeat,
    planConcepts,
    followContent,
    today,
    plan: {
      rows: plan.rader ? plan.rader.map(fraView).filter((r): r is PlanRad => r != null) : null,
      editor: plan.editor,
      // Gjest, yrke og skjelett sendes aldri til andre enn redaktører
      innboks: plan.editor && plan.innboks ? plan.innboks.map(fraInnboks).filter((r): r is InnboksRad => r != null) : null,
    },
  };
}
