// Hjelpere for testene i lib/oversikt (ingen produksjonskode bruker denne filen).

import type { ContentLatestRow, DailyActivityRow, Platform } from "../data/types";
import { addDays } from "../format";

/** Én rad per dag fra start til og med end, med samme verdier hver dag (kan overstyres). */
export function days(
  platform: Platform,
  format: DailyActivityRow["format"],
  start: string,
  end: string,
  views: number,
  through: string,
  extra: Partial<DailyActivityRow> = {},
): DailyActivityRow[] {
  const rows: DailyActivityRow[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    rows.push({
      platform,
      account_id: platform === "instagram" ? 1 : 2,
      activity_date: d,
      format,
      views,
      likes: 1,
      comments: 0,
      shares: 2,
      saves: platform === "instagram" ? 1 : null,
      interactions: 4,
      data_through: through,
      takeover_date: "2026-06-15",
      ...extra,
    });
  }
  return rows;
}

export function post(
  platform: Platform,
  format: ContentLatestRow["format"],
  publishedAt: string,
  views: number,
  extra: Partial<ContentLatestRow> = {},
): ContentLatestRow {
  return {
    platform,
    account_id: platform === "instagram" ? 1 : 2,
    content_id: `${platform}-${publishedAt}-${views}`,
    published_at: publishedAt,
    format,
    concept: "Sitcom",
    special_event: null,
    views,
    likes: 1,
    comments: 0,
    age_days: 10,
    is_mature: true,
    title: `Innlegg ${publishedAt.slice(0, 10)}`,
    permalink: "https://example.com",
    fetched_at: null,
    ...extra,
  };
}
