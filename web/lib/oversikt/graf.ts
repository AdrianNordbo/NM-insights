// «Utvikling per dag»: daglige visninger og interaksjoner for én serie, med forrige periode og
// etiketter på de største toppene. Uavhengig av Uke/Måned-velgeren: intervallet slutter alltid på
// seriens siste døgn med data.

import { addDays, daysInclusive } from "../format";
import type { Metrics, PlainSeries, Series, SeriesFormat } from "./aktivitet";

/** Det klientkomponenten får per serie (Map kan ikke sendes direkte). */
export type UtviklingSerie = { id: string; name: string; platform: Series["platform"]; plain: PlainSeries };

export type Range = "7" | "30" | "90" | "alt";
export const RANGES: Range[] = ["7", "30", "90", "alt"];
export const DEFAULT_RANGE: Range = "90";

/** Toppen er minst så mange ganger medianen, og toppene ligger minst så mange døgn fra hverandre. */
const PEAK_MIN_FACTOR = 2;
const PEAK_MIN_GAP_DAYS = 5;
/** Innlegg publisert inntil så mange dager før toppen kan være en mulig årsak. */
const PEAK_LOOKBACK_DAYS = 3;
const TITLE_MAX = 30;

/**
 * Interaksjoner = likes + kommentarer + delinger (+ lagringer på Instagram). Samme definisjon som
 * «Engasjement i perioden», ikke Metas total_interactions.
 */
export function interactions(m: Metrics, hasSaves: boolean): number {
  return m.likes + m.comments + m.shares + (hasSaves ? m.saves : 0);
}

export type ChartDay = {
  date: string;
  views: number;
  interactions: number;
  /** Tilsvarende dag i forrige periode (samme antall dager rett før). */
  prevDate: string | null;
  prevViews: number | null;
  prevInteractions: number | null;
};

export type ChartPost = { platform: Series["platform"]; format: SeriesFormat; day: string; title: string; views: number };

export type Peak = { date: string; views: number; title: string };

export type ChartData = {
  start: string;
  end: string;
  days: ChartDay[];
  prevRange: { start: string; end: string } | null;
  /** Vises bare når datoen ligger i intervallet. */
  takeover: string | null;
  peaks: Peak[];
};

const EMPTY: Metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };

export function rangeStart(s: Series, range: Range): string {
  if (range === "alt") return s.firstActive;
  const start = addDays(s.through, -Number(range) + 1);
  return start < s.firstData ? s.firstData : start;
}

const shorten = (title: string) => (title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title);

/**
 * De største toppene: over PEAK_MIN_FACTOR × medianen og minst PEAK_MIN_GAP_DAYS fra hverandre.
 * Hver topp får tittelen på innlegget med flest visninger publisert fra 3 dager før til og med toppen,
 * på samme plattform og format. Topper uten et slikt innlegg får ingen etikett.
 */
export function peaks(s: Series, days: ChartDay[], posts: ChartPost[], max: number): Peak[] {
  if (max <= 0 || !days.length) return [];
  const sorted = days.map((d) => d.views).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(PEAK_MIN_FACTOR * median, 1);
  const order = [...days].sort((a, b) => b.views - a.views || a.date.localeCompare(b.date));
  const own = posts.filter((p) => p.platform === s.platform && p.format === s.format);
  const chosen: Peak[] = [];
  for (const day of order) {
    if (chosen.length >= max || day.views < threshold) break;
    if (chosen.some((c) => Math.abs(daysInclusive(c.date, day.date) - 1) < PEAK_MIN_GAP_DAYS)) continue;
    const from = addDays(day.date, -PEAK_LOOKBACK_DAYS);
    const cause = own
      .filter((p) => p.day >= from && p.day <= day.date)
      .sort((a, b) => b.views - a.views)[0];
    if (!cause) continue;
    chosen.push({ date: day.date, views: day.views, title: shorten(cause.title) });
  }
  return chosen.sort((a, b) => a.date.localeCompare(b.date));
}

export function chartData(s: Series, range: Range, posts: ChartPost[], maxPeaks = 3): ChartData {
  const start = rangeStart(s, range);
  const end = s.through;
  const n = daysInclusive(start, end);
  const prevStart = addDays(start, -n);
  const hasPrev = range !== "alt" && prevStart >= s.firstData;
  const days: ChartDay[] = [];
  for (let i = 0, d = start; d <= end; i++, d = addDays(d, 1)) {
    const m = s.byDay.get(d) ?? EMPTY;
    const prevDate = hasPrev ? addDays(prevStart, i) : null;
    const pm = prevDate ? (s.byDay.get(prevDate) ?? EMPTY) : null;
    days.push({
      date: d,
      views: m.views,
      interactions: interactions(m, s.hasSaves),
      prevDate,
      prevViews: pm ? pm.views : null,
      prevInteractions: pm ? interactions(pm, s.hasSaves) : null,
    });
  }
  return {
    start,
    end,
    days,
    prevRange: hasPrev ? { start: prevStart, end: addDays(start, -1) } : null,
    takeover: s.takeover && s.takeover >= start && s.takeover <= end ? s.takeover : null,
    peaks: peaks(s, days, posts, maxPeaks),
  };
}

/** Minste avstand i piksler mellom to etiketter i samme rad (etikettene er opptil ca. 200 px brede). */
export const LABEL_MIN_PX = 210;

export type PlacedPeak = Peak & { row: number };

/**
 * Plasserer etikettene i rader øverst i grafen: den største toppen får rad 0, og en topp som ligger
 * nærmere enn minPx (i piksler) en etikett i samme rad, flyttes ned til neste ledige rad.
 * Alle toppene fra chartData får etikett; antallet styres med maxPeaks der.
 */
export function placePeaks(data: ChartData, plotWidth: number, minPx = LABEL_MIN_PX): PlacedPeak[] {
  const n = data.days.length;
  const index = new Map(data.days.map((d, i) => [d.date, i]));
  const x = (date: string) => (n <= 1 ? 0 : ((index.get(date) ?? 0) / (n - 1)) * plotWidth);
  const placed: PlacedPeak[] = [];
  for (const p of [...data.peaks].sort((a, b) => b.views - a.views)) {
    let row = 0;
    while (placed.some((q) => q.row === row && Math.abs(x(q.date) - x(p.date)) < minPx)) row++;
    placed.push({ ...p, row });
  }
  return placed.sort((a, b) => a.date.localeCompare(b.date));
}
