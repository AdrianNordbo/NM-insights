// Konseptmedianer regnet fra dashboard.content_latest, med samme definisjon som viewet dashboard.concept_summary
// (percentile_cont, bare modne innlegg, special_event som egne rader, foreløpig under 6). Regnes her i stedet for i
// databasen fordi konseptbrudd (Folka Først fra 18.10) og utelatte konsepter (Bankinfo) håndteres i lib/.

import { median } from "../analyse/analyse";
import type { ConceptSummaryRow, ContentLatestRow } from "../data/types";

export const FORELOPIG_UNDER = 6;

/** Median som percentile_cont: null-verdier telles ikke med. */
const med = (values: (number | null | undefined)[]) => median(values.filter((v): v is number => v != null));

export function buildConceptSummary(content: ContentLatestRow[]): ConceptSummaryRow[] {
  const groups = new Map<string, ContentLatestRow[]>();
  for (const r of content) {
    if (!r.is_mature) continue;
    const key = [r.platform, r.account_id, r.format, r.concept ?? "", r.special_event ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((rows) => {
    const first = rows[0];
    return {
      platform: first.platform,
      account_id: first.account_id,
      format: first.format,
      concept: first.concept,
      special_event: first.special_event,
      posts: rows.length,
      median_views: med(rows.map((r) => r.views)),
      median_likes: med(rows.map((r) => r.likes)),
      median_comments: med(rows.map((r) => r.comments)),
      preliminary: rows.length < FORELOPIG_UNDER,
      median_engagement_per_view: med(
        rows.map((r) => (r.views && r.likes != null && r.comments != null ? (r.likes + r.comments) / r.views : null)),
      ),
    };
  });
}
