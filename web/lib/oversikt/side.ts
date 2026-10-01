// Setter sammen alt toppfeltet og «Engasjement i perioden» trenger, fra viewene og adressen.

import type { ContentLatestRow, DailyActivityRow, PlatformSummaryRow } from "../data/types";
import { buildSeries, toPlain } from "./aktivitet";
import { navigation, type Navigation, type OversiktState, readState, type SearchParams, visibleSeries } from "./adresse";
import { type EngagementRow, engagementRow, type HeroCard, heroCard, seriesId, seriesName } from "./kort";
import type { ChartPost, UtviklingSerie } from "./graf";
import { periodLabel, trendLabel } from "./periode";
import { summarySentence } from "./sammendrag";

export type Summary = { id: string; platform: "instagram" | "youtube"; name: string; text: string };

export type OversiktTopp = {
  state: OversiktState;
  nav: Navigation;
  label: string;
  trendLabel: string;
  summaries: Summary[];
  heroes: HeroCard[];
  engagement: EngagementRow[];
  utvikling: { series: UtviklingSerie[]; posts: ChartPost[] };
};

export function buildTopp(
  daily: DailyActivityRow[],
  summary: PlatformSummaryRow[],
  content: ContentLatestRow[],
  params: SearchParams,
  today: string,
): OversiktTopp {
  const series = buildSeries(daily);
  const state = readState(params, series);
  const shown = visibleSeries(series, state.feed);
  return {
    state,
    nav: navigation(state, series),
    label: periodLabel(state.period),
    trendLabel: trendLabel(state.period.type, 12),
    summaries: shown.flatMap((s) => {
      const text = summarySentence(s, state.period, content);
      return text ? [{ id: seriesId(s), platform: s.platform, name: seriesName(s), text }] : [];
    }),
    heroes: shown.map((s) => heroCard(s, state.period, content, summary, today)),
    engagement: shown.map((s) => engagementRow(s, state.period)).filter((r): r is EngagementRow => r !== null),
    utvikling: {
      series: shown.map((s) => ({ id: seriesId(s), name: seriesName(s), platform: s.platform, plain: toPlain(s) })),
      posts: content
        .filter((x) => shown.some((s) => s.platform === x.platform && s.format === x.format))
        .map((x) => ({
          platform: x.platform,
          format: x.format,
          day: x.published_at.slice(0, 10),
          title: x.title?.split("\n")[0].trim() || "(uten tittel)",
          views: x.views ?? 0,
        })),
    },
  };
}
