// Setter sammen alt toppfeltet og «Engasjement i perioden» trenger, fra viewene og adressen.

import type { ContentLatestRow, DailyActivityRow, FollowerRow, Platform, PlatformSummaryRow } from "../data/types";
import { buildSeries, PACIFIC_TZ, type Series, toPlain } from "./aktivitet";
import { type FreshGroup, freshGroups } from "./ferske";
import { buildFollowerSeries } from "./folgere";
import { navigation, type Navigation, type OversiktState, readState, type SearchParams, visibleSeries } from "./adresse";
import { type EngagementRow, engagementRow, type HeroCard, heroCard, seriesId, seriesName } from "./kort";
import type { ChartPost, UtviklingSerie } from "./graf";
import { periodLabel, trendLabel } from "./periode";
import { summarySentence } from "./sammendrag";
import { buildTotal, takeoverDates, type TotalModel } from "./total";

export type Summary = { id: string; platform: Platform; name: string; text: string };

/**
 * Siste ferdige døgn per tidssone («i går» i plattformens døgn): { "America/Los_Angeles": …, UTC: … }.
 * En streng gjelder alle (Stillehavstid), som før TikTok.
 */
export type ExpectedThrough = string | Record<string, string>;

export const expectedFor = (e: ExpectedThrough, s: Series) => (typeof e === "string" ? e : (e[s.dayTz] ?? e[PACIFIC_TZ]));

export type OversiktTopp = {
  state: OversiktState;
  nav: Navigation;
  label: string;
  trendLabel: string;
  summaries: Summary[];
  heroes: HeroCard[];
  engagement: EngagementRow[];
  utvikling: { series: UtviklingSerie[]; posts: ChartPost[] };
  fresh: FreshGroup[];
  /** Bare når Total er valgt. */
  total: TotalModel | null;
};

export function buildTopp(
  daily: DailyActivityRow[],
  summary: PlatformSummaryRow[],
  content: ContentLatestRow[],
  params: SearchParams,
  /** Dagens dato i Oslo: bestemmer inneværende periode. */
  today: string,
  /** Siste ferdige døgn hos plattformene (i går i plattformens døgn): plattformer bak dette merkes. */
  expectedThrough: ExpectedThrough,
  /** dashboard.followers; null når viewet mangler (da vises følgertallene som før). */
  followerRows: FollowerRow[] | null = null,
): OversiktTopp {
  const series = buildSeries(daily);
  const followers = followerRows ? buildFollowerSeries(followerRows) : [];
  const fsFor = (platform: Platform) => followers.find((f) => f.platform === platform);
  const state = readState(params, today);
  const shown = visibleSeries(series, state.feed);
  return {
    state,
    nav: navigation(state, series, today),
    label: periodLabel(state.period),
    trendLabel: trendLabel(state.period.type, 12),
    summaries: shown.flatMap((s) => {
      const text = summarySentence(s, state.period, content);
      return text ? [{ id: seriesId(s), platform: s.platform, name: seriesName(s), text }] : [];
    }),
    heroes: shown.map((s) => heroCard(s, state.period, content, summary, today, expectedFor(expectedThrough, s), fsFor(s.platform))),
    engagement: shown
      .map((s) => engagementRow(s, state.period, expectedFor(expectedThrough, s)))
      .filter((r): r is EngagementRow => r !== null),
    fresh: freshGroups(content, state.feed),
    total: state.total ? buildTotal(content, takeoverDates(daily), today, followers) : null,
    utvikling: {
      series: shown.map((s) => ({ id: seriesId(s), name: seriesName(s), platform: s.platform, plain: toPlain(s) })),
      posts: content
        .filter((x) => shown.some((s) => s.platform === x.platform && s.format === x.format))
        .map((x) => ({
          platform: x.platform,
          format: x.format as Series["format"], // filteret over sikrer at formatet har en serie
          day: x.published_at.slice(0, 10),
          title: x.title?.split("\n")[0].trim() || "(uten tittel)",
          views: x.views ?? 0,
        })),
    },
  };
}
