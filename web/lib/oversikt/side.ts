// Setter sammen alt toppfeltet og «Engasjement i perioden» trenger, fra viewene og adressen.

import type { ContentLatestRow, DailyActivityRow, PlatformSummaryRow } from "../data/types";
import { buildSeries } from "./aktivitet";
import { navigation, type Navigation, type OversiktState, readState, type SearchParams, visibleSeries } from "./adresse";
import { type EngagementRow, engagementRow, type HeroCard, heroCard } from "./kort";
import { periodLabel, trendLabel } from "./periode";

export type OversiktTopp = {
  state: OversiktState;
  nav: Navigation;
  label: string;
  trendLabel: string;
  heroes: HeroCard[];
  engagement: EngagementRow[];
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
    heroes: shown.map((s) => heroCard(s, state.period, content, summary, today)),
    engagement: shown.map((s) => engagementRow(s, state.period)).filter((r): r is EngagementRow => r !== null),
  };
}
