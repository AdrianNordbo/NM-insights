// Visningsmodeller for toppfeltet (plattformkort) og «Engasjement i perioden».
// Ingen tall regnes ut i komponentene; de viser bare det som kommer herfra.

import type { ContentLatestRow, PlatformSummaryRow } from "../data/types";
import { formatDayMonth, formatRange } from "../format";
import { FOLLOWER_NAME, FORMAT_NAME, NEW_FOLLOWER_NAME, PLATFORM_NAME } from "../navn";
import { hasEnoughFollowerData } from "../regler/folgertall";
import { type Comparison, comparePeriod, type MetricKey, type Series, trend, type TrendPoint } from "./aktivitet";
import { type Change, change } from "./endring";
import { type Period, periodShortLabel } from "./periode";

export type Delta = { change: Change | null; prevLabel: string };

export type HeroCard = {
  id: string;
  platform: Series["platform"];
  name: string;
  /** «hittil, t.o.m. 28.09» når perioden ikke er ferdig for plattformen. */
  partialNote: string | null;
  /** Plattformen har ikke data så langt tilbake. */
  noDataNote: string | null;
  views: number;
  delta: Delta;
  trend: TrendPoint[];
  posts: number;
  followers: { label: string; total: number | null; newLabel: string; newInPeriod: number | null } | null;
};

export type EngagementTile = { key: MetricKey; label: string; value: number; delta: Delta; trend: TrendPoint[] };
export type EngagementRow = { id: string; platform: Series["platform"]; name: string; partialNote: string | null; tiles: EngagementTile[] };

const METRIC_LABEL: Record<MetricKey, string> = {
  views: "Visninger",
  likes: "Likes",
  comments: "Kommentarer",
  shares: "Delinger",
  saves: "Lagringer",
};

export const seriesId = (s: Series) => `${s.platform}-${s.format}`;
export const seriesName = (s: Series) => `${PLATFORM_NAME[s.platform]} · ${FORMAT_NAME[s.format]}`;

/** «uke 38», eller «uke 38, 15.–17.09» når bare en del av forrige periode er med. */
export function prevLabel(c: Comparison): string {
  const name = periodShortLabel(c.prevPeriod);
  if (!c.prevRange || (c.prevRange.start === c.prevPeriod.start && c.prevRange.end === c.prevPeriod.end)) return name;
  const { start, end } = c.prevRange;
  return `${name}, ${start === end ? formatDayMonth(start) : formatRange(start, end)}`;
}

function delta(c: Comparison, metric: MetricKey): Delta {
  return { change: change(c.current.metrics[metric], c.prev ? c.prev.metrics[metric] : null), prevLabel: prevLabel(c) };
}

const partialNote = (c: Comparison, s: Series) => (c.partial ? `hittil, t.o.m. ${formatDayMonth(s.through)}` : null);

function followers(s: Series, p: Period, rows: PlatformSummaryRow[], today: string): HeroCard["followers"] {
  const own = rows.filter((r) => r.platform === s.platform && r.format === s.format);
  const latest = own
    .filter((r) => r.followers_end != null)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .at(-1);
  const row = own.find((r) => r.period_type === p.type && r.period_start === p.start);
  return {
    label: FOLLOWER_NAME[s.platform],
    total: latest?.followers_end ?? null,
    newLabel: `${NEW_FOLLOWER_NAME[s.platform]} i perioden`,
    newInPeriod: row && hasEnoughFollowerData(row, today) ? row.new_followers : null,
  };
}

export function heroCard(
  s: Series,
  p: Period,
  content: ContentLatestRow[],
  summary: PlatformSummaryRow[],
  today: string,
): HeroCard {
  const c = comparePeriod(s, p);
  const noData = p.end < s.firstActive;
  return {
    id: seriesId(s),
    platform: s.platform,
    name: seriesName(s),
    partialNote: noData ? null : partialNote(c, s),
    noDataNote: noData ? `Ingen data før ${formatDayMonth(s.firstActive)}.${s.firstActive.slice(0, 4)}.` : null,
    views: c.current.metrics.views,
    delta: delta(c, "views"),
    trend: trend(s, p, "views"),
    posts: content.filter(
      (x) => x.platform === s.platform && x.format === s.format && x.published_at.slice(0, 10) >= p.start && x.published_at.slice(0, 10) <= p.end,
    ).length,
    // Følgere gjelder hele kontoen og vises ikke på Feed-kortet (de står allerede på Reels-kortet).
    followers: s.format === "FEED" ? null : followers(s, p, summary, today),
  };
}

export function engagementRow(s: Series, p: Period): EngagementRow | null {
  if (p.end < s.firstActive) return null;
  const c = comparePeriod(s, p);
  const keys: MetricKey[] = s.hasSaves ? ["likes", "comments", "shares", "saves"] : ["likes", "comments", "shares"];
  return {
    id: seriesId(s),
    platform: s.platform,
    name: seriesName(s),
    partialNote: partialNote(c, s),
    tiles: keys.map((key) => ({
      key,
      label: METRIC_LABEL[key],
      value: c.current.metrics[key],
      delta: delta(c, key),
      trend: trend(s, p, key),
    })),
  };
}
