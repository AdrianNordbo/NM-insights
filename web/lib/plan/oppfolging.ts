// Oppfølging av tester fra publiseringsutkastet. Testene lagres i nettleseren (ingen database i denne runden).
// Etter 7 dager (når innlegget er modent): visninger / medianen for samme type innhold på samme plattform.
// Ett innlegg er ett datapunkt; tidsrommet kan først brukes som «Basert på data» ved HEAT_MIN_N innlegg.

import { blokkFor, HEAT_MIN_N, type HeatSection, osloParts } from "../analyse/heatmap";
import type { ContentLatestRow } from "../data/types";
import { addDays } from "../format";
import { bruddFor, bruddNavn } from "../regler/konsepter";
import { PLAN_PLATTFORMER } from "../regler/plattformer";
import { OPPFOLGING_DAGER, type Plassering } from "./utkast";

export type LagretTest = Pick<Plassering, "videoId" | "title" | "concept" | "platform" | "platformLabel" | "date" | "time" | "weekday" | "block">;

export type TestStatus =
  | { kind: "planlagt"; ready: string }
  | { kind: "ikke funnet" }
  | { kind: "venter"; post: { title: string; published: string; views: number | null }; ready: string }
  | { kind: "klar"; post: { title: string; published: string; views: number }; conceptMedian: number; ratio: number; cellN: number; lovende: boolean };

/** Over denne grensen er en test lovende (samme terskel som mønstrene). */
export const LOVENDE_FRA = 1.15;

/**
 * Finner innlegget testen gjelder: samme plattform og format, samme type innhold, publisert innen én dag fra
 * planlagt dato, nærmest planlagt klokkeslett.
 */
export function finnInnlegg(test: LagretTest, content: ContentLatestRow[]): ContentLatestRow | null {
  const pp = PLAN_PLATTFORMER.find((p) => p.key === test.platform);
  if (!pp) return null;
  const from = addDays(test.date, -1), to = addDays(test.date, 1);
  const target = Date.parse(`${test.date}T${test.time}:00Z`);
  return (
    content
      .filter((r) => r.platform === pp.platform && r.format === pp.format && r.concept === test.concept)
      .filter((r) => r.published_at.slice(0, 10) >= from && r.published_at.slice(0, 10) <= to)
      .sort((a, b) => Math.abs(Date.parse(`${a.published_at.slice(0, 19)}Z`) - target) - Math.abs(Date.parse(`${b.published_at.slice(0, 19)}Z`) - target))[0] ?? null
  );
}

export function folgOpp(test: LagretTest, content: ContentLatestRow[], heat: Record<string, HeatSection | undefined>, today: string): TestStatus {
  const ready = addDays(test.date, OPPFOLGING_DAGER);
  if (test.date > today) return { kind: "planlagt", ready };
  const post = finnInnlegg(test, content);
  if (!post) return test.date < addDays(today, -1) ? { kind: "ikke funnet" } : { kind: "planlagt", ready };
  const published = post.published_at.slice(0, 10);
  if (!post.is_mature || post.views == null) return { kind: "venter", post: { title: post.title ?? test.title, published, views: post.views }, ready: addDays(published, OPPFOLGING_DAGER) };
  // Medianen for samme type innhold (gruppen etter et brudd når innlegget er publisert etter bruddatoen)
  const b = bruddFor(post.concept, post.published_at);
  const group = b ? bruddNavn(b) : (post.concept as string);
  const sec = heat[test.platform];
  const conceptMedian = sec?.conceptMedian[group] ?? null;
  if (!conceptMedian) return { kind: "venter", post: { title: post.title ?? test.title, published, views: post.views }, ready };
  const t = osloParts(post.published_at);
  const cellN = sec?.grids[group]?.[t.weekday]?.[test.block]?.n ?? 0;
  const ratio = post.views / conceptMedian;
  return { kind: "klar", post: { title: post.title ?? test.title, published, views: post.views }, conceptMedian, ratio, cellN, lovende: ratio >= LOVENDE_FRA };
}

export const trengerFlere = (cellN: number) => Math.max(0, HEAT_MIN_N - cellN);

/**
 * Et ekte eksempel til forklaringen av oppfølging: det nyeste modne innlegget i et tidsrom der typen innhold har
 * færre enn HEAT_MIN_N innlegg (som en test), uten konsepter med brudd. Null når det ikke finnes noe.
 */
export function eksempel(
  content: ContentLatestRow[],
  heat: Record<string, HeatSection | undefined>,
): { platformLabel: string; concept: string; published: string; time: string; weekday: number; block: number; views: number; conceptMedian: number; ratio: number; cellN: number } | null {
  const rows = content
    .filter((r) => r.is_mature && r.views != null && r.concept && !r.special_event && !bruddFor(r.concept, "9999-12-31") && !r.concept.includes("(fra "))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  for (const r of rows) {
    const pp = PLAN_PLATTFORMER.find((p) => p.platform === r.platform && p.format === r.format);
    const sec = pp ? heat[pp.key] : undefined;
    const median = sec?.conceptMedian[r.concept as string];
    if (!pp || !sec || !median) continue;
    const t = osloParts(r.published_at);
    const block = blokkFor(t.hour);
    if (block < 0) continue;
    const cellN = sec.grids[r.concept as string]?.[t.weekday]?.[block]?.n ?? 0;
    if (cellN >= HEAT_MIN_N) continue;
    return { platformLabel: pp.label, concept: r.concept as string, published: r.published_at.slice(0, 10), time: t.hm, weekday: t.weekday, block, views: r.views as number, conceptMedian: median, ratio: (r.views as number) / median, cellN };
  }
  return null;
}
