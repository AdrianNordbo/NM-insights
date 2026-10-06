// «Total»: summen siden Nordbø Marketing tok over (takeover_date), fra innleggene i dashboard.content_latest.
// Visninger per innlegg (siste måling), alle aldre, uten annonsevisninger, uavhengig av special_event (VM o.l.
// skilles bare ut i konsepttabellen og anbefalingene). Feed er alltid med, uansett
// Feed-bryteren. Plattformene vises hver for seg og sammenlignes aldri (ingen andeler mellom dem).

import type { ContentLatestRow, Platform } from "../data/types";
import { PLATFORM_NAME } from "../navn";
import { currentPeriod, nextPeriod, type Period, periodLabel, periodOf } from "./periode";

export type TotalPoint = { key: string; label: string; value: number };

export type TotalPlatform = {
  platform: Platform;
  name: string;
  since: string;
  posts: number;
  views: number;
  likes: number;
  comments: number;
  /** Sum av delinger der tallet finnes. */
  shares: number;
  /** Antall innlegg med delingstall (resten mangler og er ikke med i summen). */
  postsWithShares: number;
  /** Kumulative visninger per publiseringsuke siden start, med dagens tall per innlegg. */
  cumulative: TotalPoint[];
};

export type TotalModel = {
  /** Tidligste startdato blant plattformene (vanligvis lik for alle). */
  since: string;
  views: number;
  platforms: TotalPlatform[];
};

const PLATFORMS: Platform[] = ["instagram", "youtube"];

/** Innlegget er publisert på eller etter startdatoen (Oslo-dato). */
export const publishedSince = (row: ContentLatestRow, since: string) => row.published_at.slice(0, 10) >= since;

/** Ukene fra uken startdatoen ligger i, til og med inneværende uke (Oslo-kalenderen). */
function weeksSince(since: string, osloToday: string): Period[] {
  const out: Period[] = [];
  const last = currentPeriod("uke", osloToday);
  for (let p = periodOf("uke", since); p.start <= last.start; p = nextPeriod(p)) out.push(p);
  return out;
}

/**
 * takeover: startdato per plattform (fra daily_activity.takeover_date). Plattformer uten startdato
 * eller uten innlegg utelates.
 */
export function buildTotal(
  content: ContentLatestRow[],
  takeover: Partial<Record<Platform, string>>,
  osloToday: string,
): TotalModel | null {
  const platforms: TotalPlatform[] = [];
  for (const platform of PLATFORMS) {
    const since = takeover[platform];
    if (!since) continue;
    const rows = content.filter((r) => r.platform === platform && publishedSince(r, since)); // alle formater, også Feed
    if (!rows.length) continue;
    const sum = (f: (r: ContentLatestRow) => number | null | undefined) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
    const withShares = rows.filter((r) => r.shares != null);
    const cumulative = weeksSince(since, osloToday).map((w) => ({
      key: w.start,
      label: periodLabel(w),
      value: rows.filter((r) => r.published_at.slice(0, 10) <= w.end).reduce((s, r) => s + (r.views ?? 0), 0),
    }));
    platforms.push({
      platform,
      name: PLATFORM_NAME[platform],
      since,
      posts: rows.length,
      views: sum((r) => r.views),
      likes: sum((r) => r.likes),
      comments: sum((r) => r.comments),
      shares: withShares.reduce((s, r) => s + (r.shares ?? 0), 0),
      postsWithShares: withShares.length,
      cumulative,
    });
  }
  if (!platforms.length) return null;
  return {
    since: platforms.map((p) => p.since).sort()[0],
    views: platforms.reduce((s, p) => s + p.views, 0),
    platforms,
  };
}

/** Startdato per plattform fra daily_activity-radene (takeover_date). */
export function takeoverDates(rows: { platform: Platform; takeover_date: string | null }[]): Partial<Record<Platform, string>> {
  const out: Partial<Record<Platform, string>> = {};
  for (const r of rows) if (r.takeover_date && !out[r.platform]) out[r.platform] = r.takeover_date;
  return out;
}

/** «15.06» for overskriften. */
export const sinceLabel = (since: string) => `${since.slice(8, 10)}.${since.slice(5, 7)}`;
