// Daglig aktivitet (dashboard.daily_activity) summert per periode, med sammenligning mot forrige periode.
// Én serie per plattform + format; plattformer og formater blandes aldri.

import type { DailyActivityRow, Platform } from "../data/types";
import { addDays, daysInclusive } from "../format";
import { type Period, periodLabel, periodsBack, prevPeriod } from "./periode";

export type SeriesFormat = "REELS" | "FEED" | "SHORTS";
export type MetricKey = "views" | "likes" | "comments" | "shares" | "saves";
export type Metrics = Record<MetricKey, number>;

export type Series = {
  platform: Platform;
  format: SeriesFormat;
  /** Siste døgn med data for kontoen. */
  through: string;
  /** Første døgn med data for kontoen (uansett format). */
  firstData: string;
  /** Første døgn med visninger i dette formatet. */
  firstActive: string;
  takeover: string | null;
  hasSaves: boolean;
  byDay: Map<string, Metrics>;
};

const SERIES_KEYS: { platform: Platform; format: SeriesFormat }[] = [
  { platform: "instagram", format: "REELS" },
  { platform: "instagram", format: "FEED" },
  { platform: "youtube", format: "SHORTS" },
];

const EMPTY: Metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };

/** Lager seriene fra radene. Serier uten rader i det hele tatt utelates. */
export function buildSeries(rows: DailyActivityRow[]): Series[] {
  const out: Series[] = [];
  for (const key of SERIES_KEYS) {
    const account = rows.filter((r) => r.platform === key.platform);
    const own = account.filter((r) => r.format === key.format);
    if (!own.length) continue;
    const byDay = new Map<string, Metrics>();
    for (const r of own) {
      byDay.set(r.activity_date, {
        views: r.views ?? 0,
        likes: r.likes ?? 0,
        comments: r.comments ?? 0,
        shares: r.shares ?? 0,
        saves: r.saves ?? 0,
      });
    }
    const active = own.filter((r) => (r.views ?? 0) > 0).map((r) => r.activity_date).sort();
    const dates = account.map((r) => r.activity_date).sort();
    out.push({
      ...key,
      through: account[0].data_through,
      firstData: dates[0],
      firstActive: active[0] ?? own[0].data_through,
      takeover: account[0].takeover_date,
      hasSaves: key.platform === "instagram",
      byDay,
    });
  }
  return out;
}

export type Sum = { metrics: Metrics; days: number };

/** Summen fra start til og med slutt, men aldri forbi seriens siste døgn med data. */
export function sumRange(s: Series, start: string, end: string): Sum {
  const last = end < s.through ? end : s.through;
  const metrics = { ...EMPTY };
  if (last < start) return { metrics, days: 0 };
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const day = s.byDay.get(d);
    if (!day) continue;
    for (const k of Object.keys(metrics) as MetricKey[]) metrics[k] += day[k];
  }
  return { metrics, days: daysInclusive(start, last) };
}

export type Comparison = {
  current: Sum;
  /** Null når plattformen ikke hadde data i forrige periode. */
  prev: Sum | null;
  prevPeriod: Period;
  /** Datoene forrige periode er målt over (kan være kortere enn hele perioden). */
  prevRange: { start: string; end: string } | null;
  /** Perioden er ikke ferdig for denne serien (data_through før periodens slutt). */
  partial: boolean;
};

/**
 * Sammenligner perioden med forrige periode. En uferdig periode sammenlignes med like mange dager
 * i starten av forrige periode (men aldri mer enn hele forrige periode). En ferdig periode
 * sammenlignes med hele forrige periode, også når de er ulikt lange (31 mot 30 dager).
 */
export function comparePeriod(s: Series, p: Period): Comparison {
  const current = sumRange(s, p.start, p.end);
  const partial = p.end > s.through;
  const pp = prevPeriod(p);
  let prevEnd = pp.end;
  if (partial) {
    const sameDays = addDays(pp.start, current.days - 1);
    if (sameDays < prevEnd) prevEnd = sameDays;
  }
  const hasPrev = current.days > 0 && pp.end >= s.firstActive && prevEnd >= pp.start;
  return {
    current,
    prev: hasPrev ? sumRange(s, pp.start, prevEnd) : null,
    prevPeriod: pp,
    prevRange: hasPrev ? { start: pp.start, end: prevEnd } : null,
    partial,
  };
}

export type TrendPoint = { key: string; label: string; value: number | null };

/** Verdien for de n siste periodene til og med p. Perioder før kontoen har data blir null. */
export function trend(s: Series, p: Period, metric: MetricKey, n = 12): TrendPoint[] {
  return periodsBack(p, n).map((q) => ({
    key: q.start,
    label: periodLabel(q),
    value: q.end < s.firstData || q.start > s.through ? null : sumRange(s, q.start, q.end).metrics[metric],
  }));
}

/** Serien i en form som kan sendes til en klientkomponent (uten Map). */
export type PlainSeries = Omit<Series, "byDay"> & { days: [string, Metrics][] };

export const toPlain = (s: Series): PlainSeries => {
  const { byDay, ...rest } = s;
  return { ...rest, days: [...byDay.entries()] };
};

export const fromPlain = (p: PlainSeries): Series => {
  const { days, ...rest } = p;
  return { ...rest, byDay: new Map(days) };
};
