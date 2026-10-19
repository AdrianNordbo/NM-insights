// Gjør radene fra dashboard-viewene klare for sidene. Ett sted for reglene som gjelder alle sider:
// - Totaler og kontotall bruker alle innlegg (også Bankinfo).
// - Lister, konsepter, anbefalinger, mønstre og medianer bruker innlegg uten utelatte konsepter, med
//   konseptbrudd delt (Folka Først fra 26.10 som egen gruppe).
// - Konseptmedianene regnes fra content_latest (samme definisjon som dashboard.concept_summary).

import type { FeatureRow } from "../analyse/analyse";
import { buildSeries, type Series } from "../oversikt/aktivitet";
import { buildFollowerSeries, type FollowerSeries } from "../oversikt/folgere";
import { buildConceptSummary } from "../oversikt/konseptmedianer";
import { buildTotal, takeoverDates, type TotalModel } from "../oversikt/total";
import { delVedBrudd, utenUtelatte } from "../regler/konsepter";
import type { ConceptSummaryRow, ContentLatestRow, DailyActivityRow, FollowerPointRow, FollowerRow, Platform } from "./types";

export type Raadata = {
  daily: DailyActivityRow[];
  content: ContentLatestRow[];
  followers?: FollowerRow[] | null;
  points?: FollowerPointRow[] | null;
  features?: FeatureRow[] | null;
};

export type Forberedt = {
  series: Series[];
  followers: FollowerSeries[];
  /** Alle innlegg (også Bankinfo): totaler. */
  content: ContentLatestRow[];
  /** Uten utelatte konsepter, brudd delt: lister, konsepter, anbefalinger. */
  listContent: ContentLatestRow[];
  concepts: ConceptSummaryRow[];
  features: FeatureRow[];
  takeover: Partial<Record<Platform, string>>;
  total: TotalModel | null;
};

export function forbered(raw: Raadata, today: string): Forberedt {
  const followers = raw.followers ? buildFollowerSeries(raw.followers, raw.points ?? null) : [];
  const listContent = delVedBrudd(utenUtelatte(raw.content));
  const takeover = takeoverDates(raw.daily);
  return {
    series: buildSeries(raw.daily),
    followers,
    content: raw.content,
    listContent,
    concepts: buildConceptSummary(listContent),
    features: delVedBrudd(utenUtelatte(raw.features ?? [])),
    takeover,
    total: buildTotal(raw.content, takeover, today, followers),
  };
}
