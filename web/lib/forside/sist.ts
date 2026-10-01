import { FORMAT_ORDER } from "../navn";
import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";

export const RECENT_MIN_DAYS = 7;
export const RECENT_MAX_DAYS = 14;

export type RecentPost = {
  platform: Platform;
  format: Format;
  /** none = ingen innlegg i perioden; single = bare ett (fremheves ikke); best = beste av flere. */
  state: "none" | "single" | "best";
  post: ContentLatestRow | null;
  /** Visninger delt på konseptets median på samme plattform og format; null hvis den ikke finnes. */
  ratio: number | null;
  preliminary: boolean;
};

function sameGroup(c: ConceptSummaryRow, p: ContentLatestRow) {
  return (
    c.platform === p.platform &&
    c.format === p.format &&
    c.concept === p.concept &&
    (c.special_event ?? null) === (p.special_event ?? null)
  );
}

/** Beste innlegg per plattform og format blant innlegg som er 7–14 dager gamle. */
export function buildRecent(content: ContentLatestRow[], concepts: ConceptSummaryRow[]): RecentPost[] {
  const combos = [...new Map(content.map((p) => [`${p.platform}|${p.format}`, p])).values()]
    .map((p) => ({ platform: p.platform, format: p.format }))
    .sort((a, b) => a.platform.localeCompare(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

  return combos.map(({ platform, format }) => {
    const window = content
      .filter((p) => p.platform === platform && p.format === format)
      .filter((p) => p.age_days >= RECENT_MIN_DAYS && p.age_days <= RECENT_MAX_DAYS)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    if (window.length === 0) return { platform, format, state: "none", post: null, ratio: null, preliminary: false };

    const post = window[0];
    const group = concepts.find((c) => sameGroup(c, post));
    const ratio = group?.median_views && post.views != null ? post.views / group.median_views : null;
    return {
      platform,
      format,
      state: window.length === 1 ? "single" : "best",
      post,
      ratio,
      preliminary: group?.preliminary ?? false,
    };
  });
}
