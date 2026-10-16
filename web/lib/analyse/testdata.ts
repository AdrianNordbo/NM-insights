// Hjelpere for testene i lib/analyse.
import type { FeatureRow } from "./analyse";

let id = 0;
export function row(p: Partial<FeatureRow>): FeatureRow {
  id += 1;
  return {
    platform: "instagram",
    account_id: 1,
    content_id: `c${id}`,
    format: "REELS",
    special_event: null,
    published_at: "2026-09-01T19:00:00",
    weekday: 1,
    hour: 19,
    hashtag_count: 5,
    hashtags: null,
    text_length: 100,
    duration_s: 30,
    duration_source: "TikTok-versjonen",
    is_mature: true,
    concept: "Sitcom",
    views: 100,
    ...p,
  };
}

/** n innlegg i konseptet med gitte visninger. */
export const many = (concept: string, views: number[], p: Partial<FeatureRow> = {}) => views.map((v) => row({ concept, views: v, ...p }));
