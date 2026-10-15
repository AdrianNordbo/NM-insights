// «Total»: summen siden Nordbø Marketing tok over (takeover_date), fra innleggene i dashboard.content_latest.
// Visninger per innlegg (siste måling), alle aldre, uten annonsevisninger, uavhengig av special_event (VM o.l.
// skilles bare ut i konsepttabellen og anbefalingene). Feed er alltid med, uansett
// Feed-bryteren. Plattformene vises hver for seg og sammenlignes aldri (ingen andeler mellom dem).
// TikTok: levetidstall per innlegg (video_views), som kan inneholde betalt visning; ferske innlegg som TikTok
// ikke har behandlet ennå, er med med de tallene som finnes.

import type { ContentLatestRow, Platform } from "../data/types";
import { PLATFORM_NAME, PLATFORM_ORDER } from "../navn";
import { type FollowerSeries, followersNow, followersNowSum, netto, sinceStartText, startLabel } from "./folgere";
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
  /**
   * Følgere nå og netto siden start («+40 siden 15.06», eller «+10 siden 29.09» når målingene starter
   * senere og startverdi mangler). Null når dashboard.followers mangler.
   */
  followers: {
    now: number | null;
    since: string | null;
    /** «fra 432 til 515» og etiketten når startverdien er brukt; ellers null. */
    fromTo: string | null;
    startLabel: string | null;
  } | null;
};

export type TotalModel = {
  /** Tidligste startdato blant plattformene (vanligvis lik for alle). */
  since: string;
  views: number;
  platforms: TotalPlatform[];
  /** Sum av «følgere nå» på kontoene (ikke unike personer). Null når dashboard.followers mangler. */
  followersNow: number | null;
};

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
  /** Fra dashboard.followers; tom liste = viewet mangler, og Total vises uten følgere som før. */
  followers: FollowerSeries[] = [],
): TotalModel | null {
  const platforms: TotalPlatform[] = [];
  for (const platform of PLATFORM_ORDER) {
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
      followers: followerInfo(followers.find((f) => f.platform === platform), since, osloToday),
    });
  }
  if (!platforms.length) return null;
  // Bare totalene summeres, og bare for plattformene som vises i Total (aldri netto på tvers).
  const shownFollowers = followers.filter((f) => platforms.some((p) => p.platform === f.platform));
  return {
    since: platforms.map((p) => p.since).sort()[0],
    views: platforms.reduce((s, p) => s + p.views, 0),
    platforms,
    followersNow: followersNowSum(shownFollowers)?.total ?? null,
  };
}

function followerInfo(fs: FollowerSeries | undefined, since: string, osloToday: string): TotalPlatform["followers"] {
  if (!fs) return null;
  const n = netto(fs, since, osloToday, osloToday);
  const fmt = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
  const usedStart = n.kind === "value" && n.start;
  return {
    now: followersNow(fs)?.value ?? null,
    since: sinceStartText(n),
    fromTo: usedStart ? `fra ${fmt.format(n.from)} til ${fmt.format(n.to)}` : null,
    startLabel: usedStart && n.start ? startLabel(n.start) : null,
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
