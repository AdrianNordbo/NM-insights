// Heatmap for publiseringstid: ukedag × tidsblokk per plattform og format (Oslo-tid).
// Verdi: median av (innleggets visninger / medianen for samme type innhold på samme plattform og format).
// Bare modne innlegg uten spesiell hendelse; Bankinfo og samlekategorier er utelatt, og konseptbrudd er delt
// (se lib/regler/konsepter.ts). Celler med færre enn HEAT_MIN_N innlegg viser bare antallet.
// Et mønster i egne tall, ikke bevis, og ingen rangering av «beste tid».

import type { ContentLatestRow, Format, Platform } from "../data/types";
import { delVedBrudd, IKKE_ANALYSE } from "../regler/konsepter";
import { median } from "./analyse";

export const HEAT_MIN_N = 3;

/** 7 × 4 ga like mange brukbare celler som 7 × 3 og skiller 16–20 fra 20–24 (kartlagt 19.10.2026). */
export const TIDSBLOKKER = [
  { key: "06-11", label: "06–11", from: 6, to: 11, defaultTime: "09:00" },
  { key: "11-16", label: "11–16", from: 11, to: 16, defaultTime: "13:00" },
  { key: "16-20", label: "16–20", from: 16, to: 20, defaultTime: "18:00" },
  { key: "20-24", label: "20–24", from: 20, to: 24, defaultTime: "21:00" },
] as const;

export const UKEDAGER = ["man", "tir", "ons", "tor", "fre", "lør", "søn"] as const;
export const UKEDAGER_LANG = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"] as const;

export type HeatCell = { n: number; median: number | null; time: string | null };
/** [ukedag 0 = mandag][tidsblokk] */
export type HeatGrid = HeatCell[][];

export type HeatSection = {
  platform: Platform;
  format: Format;
  /** Modne innlegg i grunnlaget (med en tidsblokk). */
  n: number;
  concepts: string[];
  conceptPosts: Record<string, number>;
  conceptMedian: Record<string, number>;
  /** «alle» og hvert konsept. */
  grids: Record<string, HeatGrid>;
};

/** Ukedag (0 = mandag), time og «HH:MM» fra en lokal Oslo-tid uten sone («2026-10-08T20:01:15»). */
export function osloParts(publishedAt: string): { weekday: number; hour: number; hm: string } {
  const d = new Date(`${publishedAt.slice(0, 19)}Z`);
  return { weekday: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours(), hm: publishedAt.slice(11, 16) };
}

export const blokkFor = (hour: number) => TIDSBLOKKER.findIndex((b) => hour >= b.from && hour < b.to);

/** Innleggene heatmapet bygger på (modne, uten hendelse, utelatte konsepter ute, brudd delt). */
export function heatGrunnlag(content: ContentLatestRow[]): ContentLatestRow[] {
  return delVedBrudd(content.filter((r) => r.is_mature && !r.special_event && r.views != null && r.concept && !IKKE_ANALYSE.includes(r.concept)));
}

function grid(rows: { weekday: number; block: number; ratio: number; hm: string }[]): HeatGrid {
  return Array.from({ length: 7 }, (_, wd) =>
    TIDSBLOKKER.map((_, b) => {
      const cell = rows.filter((r) => r.weekday === wd && r.block === b);
      const times = cell.map((r) => r.hm).sort();
      return { n: cell.length, median: median(cell.map((r) => r.ratio)), time: times.length ? times[Math.floor((times.length - 1) / 2)] : null };
    }),
  );
}

export function buildHeat(content: ContentLatestRow[], platform: Platform, format: Format): HeatSection {
  const own = heatGrunnlag(content).filter((r) => r.platform === platform && r.format === format);
  const conceptMedian: Record<string, number> = {};
  for (const c of new Set(own.map((r) => r.concept as string))) conceptMedian[c] = median(own.filter((r) => r.concept === c).map((r) => r.views as number)) as number;
  const rated = own
    .filter((r) => conceptMedian[r.concept as string] > 0)
    .map((r) => {
      const t = osloParts(r.published_at);
      return { concept: r.concept as string, weekday: t.weekday, block: blokkFor(t.hour), hm: t.hm, ratio: (r.views as number) / conceptMedian[r.concept as string] };
    })
    .filter((r) => r.block >= 0);
  const conceptPosts: Record<string, number> = {};
  for (const r of rated) conceptPosts[r.concept] = (conceptPosts[r.concept] ?? 0) + 1;
  const concepts = Object.keys(conceptPosts).sort((a, b) => conceptPosts[b] - conceptPosts[a] || a.localeCompare(b, "nb"));
  const grids: Record<string, HeatGrid> = { alle: grid(rated) };
  for (const c of concepts) grids[c] = grid(rated.filter((r) => r.concept === c));
  return { platform, format, n: rated.length, concepts, conceptPosts, conceptMedian, grids };
}

/** Celler med minst HEAT_MIN_N innlegg for et konsept (grunnlaget for «Basert på data» i utkastet). */
export function dataCeller(section: HeatSection | undefined, concept: string): { weekday: number; block: number; n: number; median: number; time: string }[] {
  const g = section?.grids[concept];
  if (!g) return [];
  const out: { weekday: number; block: number; n: number; median: number; time: string }[] = [];
  g.forEach((row, weekday) =>
    row.forEach((c, block) => {
      if (c.n >= HEAT_MIN_N && c.median != null) out.push({ weekday, block, n: c.n, median: c.median, time: c.time ?? TIDSBLOKKER[block].defaultTime });
    }),
  );
  return out;
}
