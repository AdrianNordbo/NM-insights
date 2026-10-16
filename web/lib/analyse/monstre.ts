// Visningsmodell for «Mønster» (/monstre) og «Hva har fungert» på Oversikt. Alle tekster lages her;
// komponentene viser bare. Reglene ligger i analyse.ts og endres ikke her.

import type { Format, Platform } from "../data/types";
import { formatDayMonth } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME, PLATFORM_ORDER } from "../navn";
import {
  analyse,
  ANALYSE_FORMATS,
  BRUK_MIN_CONCEPTS,
  BRUK_MIN_POSTS,
  BRUK_MIN_RATIO,
  type FeatureRow,
  type Finding,
  rate,
  RETNING_MIN_POSTS,
  RETNING_MIN_RATIO,
  tidsromSjekk,
} from "./analyse";

/** «Bruk» med grunnlag under denne medianen vises som «Svakt». Bare visning; reglene er uendret. */
export const SVAKT_UNDER = 1.2;

export type Label = "sikkert" | "svakt" | "prøv";
export const LABEL_NAME: Record<Label, string> = { sikkert: "Sikkert", svakt: "Svakt", prøv: "Prøv" };
const LABEL_ORDER: Label[] = ["sikkert", "svakt", "prøv"];

const two = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1.309 → «1,31 ganger vanlig». Alltid to desimaler, så 1,15 ikke ser ut som 1,2. */
export const ganger = (v: number) => `${two.format(v)} ganger vanlig`;

/** «A», «A og B», «A, B og C». */
export function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

/** Hva innleggene heter i rådene: «Reels», «Shorts», «TikTok-videoer». */
const CONTENT_NAME: Partial<Record<`${Platform}|${Format}`, string>> = {
  "instagram|REELS": "Reels",
  "youtube|SHORTS": "Shorts",
  "tiktok|VIDEO": "TikTok-videoer",
};

export function label(f: Finding): Label | null {
  if (f.status === "test") return "prøv";
  if (f.status === "bruk") return (f.solid.median ?? 0) < SVAKT_UNDER ? "svakt" : "sikkert";
  return null;
}

const contentName = (f: Finding) => CONTENT_NAME[`${f.platform}|${f.format as Format}`] ?? FORMAT_NAME[f.format as Format];
/** YouTube-teksten er tittelen. */
const textName = (f: Finding) => (f.platform === "youtube" ? "titler" : "tekst");

/** Rådet i én setning. */
export function advice(f: Finding): string {
  const c = contentName(f);
  if (f.factor === "tidsrom") return `Publiser ${c} ${f.level}`;
  if (f.factor === "ukedag") return `Publiser ${list(f.concepts)} på ${f.level}er`;
  if (f.factor === "tekstlengde") {
    const size = f.level.split(" ")[0]; // kort / middels / lang
    const t = textName(f);
    const adj = t === "titler" ? { kort: "korte", middels: "middels lange", lang: "lange" } : { kort: "kort", middels: "middels lang", lang: "lang" };
    return `Bruk ${adj[size as keyof typeof adj]} ${t} på ${c}`;
  }
  if (f.factor === "varighet") {
    const size = f.level.split(" ")[0];
    return size === "kort" ? `Lag korte ${c}` : size === "lang" ? `Lag lange ${c}` : `Lag ${c} av middels lengde`;
  }
  return f.level;
}

/** Forslag (ikke påstand) for «Prøv». */
function suggestion(f: Finding): string {
  const tail = "og se om de får flere visninger enn vanlig for samme type innhold.";
  if (f.factor === "tidsrom") return `Forslag: publiser noen av de neste innleggene ${f.level} ${tail}`;
  if (f.factor === "ukedag") return `Forslag: legg noen av de neste ${list(f.concepts)}-innleggene på ${f.level} ${tail}`;
  if (f.factor === "tekstlengde") return `Forslag: gi noen av de neste innleggene ${f.level === "kort tekst" ? "kortere" : f.level === "lang tekst" ? "lengre" : "middels lang"} ${textName(f) === "titler" ? "tittel" : "tekst"} ${tail}`;
  return `Forslag: lag noen av de neste innleggene ${f.level === "kort video" ? "kortere" : f.level === "lang video" ? "lengre" : "av middels lengde"} ${tail}`;
}

function why(f: Finding): string[] {
  const out: string[] = [];
  const s = f.solid;
  if (s.posts === 0) out.push("ingen type innhold med nok innlegg (minst 6) og uten mulig tidstrend");
  else if (s.posts < BRUK_MIN_POSTS) out.push(`bare ${s.posts} innlegg å bygge på (trenger ${BRUK_MIN_POSTS})`);
  if (s.posts > 0 && s.conceptsUp.length < BRUK_MIN_CONCEPTS)
    out.push(
      `${s.conceptsUp.length === 1 ? "bare én type innhold" : "ingen typer innhold"} viser det samme (minst ${two.format(RETNING_MIN_RATIO)} ganger vanlig på ${RETNING_MIN_POSTS} innlegg)`,
    );
  if (s.conceptsDown.length) out.push(`${list(s.conceptsDown)} viser det motsatte`);
  if (s.posts > 0 && (s.median ?? 0) < BRUK_MIN_RATIO) out.push(`for lite forskjell (${ganger(s.median ?? 0)}, trenger ${two.format(BRUK_MIN_RATIO)})`);
  return out;
}

export type DetailConcept = {
  name: string;
  preliminary: boolean;
  /** «1,15 ganger vanlig · 24 innlegg · 18–37 tegn · 15.06–05.10» */
  line: string;
  /** «bare brukt 06.08–17.09; typen innhold publisert 18.06–17.09» */
  tidstrend: string | null;
};

export type MonsterCard = {
  id: string;
  label: Label;
  advice: string;
  /** «1,31 ganger vanlig visningstall · 35 innlegg» */
  numbers: string;
  details: {
    concepts: DetailConcept[];
    /** For «Sikkert»/«Svakt»: hvilke typer innhold tallet bygger på, og alle innlegg i gruppen. */
    basis: string | null;
    suggestion: string | null;
    why: string[];
    /** Tidsrom: kanalen kan ha vokst over tid. */
    note: string | null;
  };
};

export type MonsterSection = {
  id: string;
  platform: Platform;
  format: Format;
  name: string;
  cards: MonsterCard[];
  /** Grunnlaget, til «Slik leser du tallene»: «84 innlegg: Folka Først 50 · …» */
  basis: string;
  preliminary: string[];
};

const range = (a: string, b: string) => (a === b ? formatDayMonth(a) : `${formatDayMonth(a)}–${formatDayMonth(b)}`);

function details(rows: FeatureRow[], f: Finding): MonsterCard["details"] {
  const sjekk = f.factor === "tidsrom" ? tidsromSjekk(rows, f.platform, f.format) : [];
  const unit = f.factor === "varighet" ? "s" : "tegn";
  const concepts = f.perConcept.map((c) => {
    const parts = [ganger(c.median), `${c.posts} innlegg`];
    if (c.range) {
      const [lo, hi] = c.range.map((v) => Math.round(v));
      parts.push(lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`);
    }
    let tidstrend: string | null = null;
    if (f.factor === "tidsrom") {
      const own = sjekk.filter((t) => t.concept === c.concept);
      const band = own.find((t) => t.band === f.level);
      if (band) parts.push(range(band.first, band.last));
      if (band && f.tidstrend.includes(c.concept)) {
        const first = own.map((t) => t.first).sort()[0];
        const last = own.map((t) => t.last).sort().at(-1) as string;
        tidstrend = `mulig tidstrend: tidsrommet er bare brukt ${range(band.first, band.last)}, mens ${c.concept} er publisert ${range(first, last)}`;
      }
    }
    return { name: c.concept, preliminary: c.preliminary, line: parts.join(" · "), tidstrend };
  });
  const bruk = f.status === "bruk";
  return {
    concepts,
    basis: bruk
      ? `Bygger på ${list(f.solid.conceptsUp)}. Alle innlegg i gruppen: ${ganger(f.median)} på ${f.posts} innlegg.`
      : null,
    suggestion: bruk ? null : suggestion(f),
    why: bruk ? [] : why(f),
    note: f.factor === "tidsrom" ? "Kanalen kan ha vokst over tid, så senere innlegg kan ha fått flere visninger uansett tidspunkt." : null,
  };
}

function card(rows: FeatureRow[], f: Finding): MonsterCard {
  const lab = label(f) as Label;
  const bruk = f.status === "bruk";
  const r = bruk ? (f.solid.median as number) : f.median;
  const n = bruk ? f.solid.posts : f.posts;
  return {
    id: `${f.platform}-${f.format}-${f.factor}-${f.level}`.replace(/[^a-z0-9æøå-]+/gi, "-").toLowerCase(),
    label: lab,
    advice: advice(f),
    numbers: `${ganger(r)} visningstall · ${n} innlegg`,
    details: details(rows, f),
  };
}

/** Én seksjon per plattform + format som analyseres, i fast rekkefølge: Sikkert, Svakt, Prøv. */
export function buildMonstre(rows: FeatureRow[]): MonsterSection[] {
  const rated = rate(rows);
  const findings = analyse(rows);
  const out: MonsterSection[] = [];
  for (const platform of PLATFORM_ORDER) {
    for (const format of FORMAT_ORDER.filter((x) => ANALYSE_FORMATS[platform].includes(x))) {
      const own = rated.filter((r) => r.platform === platform && r.format === format);
      if (!own.length) continue;
      const counts = new Map<string, { posts: number; preliminary: boolean }>();
      for (const r of own) counts.set(r.concept as string, { posts: (counts.get(r.concept as string)?.posts ?? 0) + 1, preliminary: r.preliminaryConcept });
      const baseline = [...counts].sort((a, b) => b[1].posts - a[1].posts || a[0].localeCompare(b[0], "nb"));
      const cards = findings
        .filter((f) => f.platform === platform && f.format === format && label(f))
        .map((f) => card(rows, f))
        .sort((a, b) => LABEL_ORDER.indexOf(a.label) - LABEL_ORDER.indexOf(b.label));
      out.push({
        id: `${platform}-${format}`.toLowerCase(),
        platform,
        format,
        name: `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`,
        cards,
        basis: `${own.length} innlegg: ${baseline.map(([name, c]) => `${name} ${c.posts}`).join(" · ")}`,
        preliminary: baseline.filter(([, c]) => c.preliminary).map(([name]) => name),
      });
    }
  }
  return out;
}

export type FungertRow = { id: string; name: string; lines: { advice: string; numbers: string }[] };

export const FUNGERT_MAX = 3;

/** «Hva har fungert» på Oversikt: bare «Sikkert», maks 3 per plattform og format. */
export function buildFungert(sections: MonsterSection[]): FungertRow[] {
  return sections.map((s) => ({
    id: s.id,
    name: s.name,
    lines: s.cards
      .filter((c) => c.label === "sikkert")
      .slice(0, FUNGERT_MAX)
      .map((c) => ({ advice: c.advice, numbers: c.numbers })),
  }));
}
