// «Hva funket sist?»: beste innlegg per plattform og format blant innlegg som er 7–14 dager gamle,
// med visningene som et forhold til konseptets median på samme plattform og format («×1,4 av vanlig»).

import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";
import { formatDayMonth } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME } from "../navn";
import { formatVisible } from "./adresse";

export const RECENT_MIN_DAYS = 7;
export const RECENT_MAX_DAYS = 14;

export type RecentPost = {
  platform: Platform;
  format: Format;
  name: string;
  /** none = ingen innlegg i perioden; single = bare ett (fremheves ikke); best = beste av flere. */
  state: "none" | "single" | "best";
  post: {
    title: string;
    permalink: string | null;
    views: number | null;
    /** «Uten kompetanse», eller «Annet (VM 2026)» for spesielle hendelser. */
    concept: string;
    published: string;
  } | null;
  /** Visninger delt på konseptets median på samme plattform og format; null hvis den ikke finnes. */
  ratio: number | null;
  preliminary: boolean;
  /** Fremheves bare når det er beste av flere, minst like godt som vanlig og ikke foreløpig. */
  highlight: boolean;
};

function sameGroup(c: ConceptSummaryRow, p: ContentLatestRow) {
  return (
    c.platform === p.platform &&
    c.format === p.format &&
    c.concept === p.concept &&
    (c.special_event ?? null) === (p.special_event ?? null)
  );
}

export function buildRecent(content: ContentLatestRow[], concepts: ConceptSummaryRow[], feed: boolean): RecentPost[] {
  const combos = [...new Map(content.map((p) => [`${p.platform}|${p.format}`, p])).values()]
    .map((p) => ({ platform: p.platform, format: p.format }))
    .filter((c) => formatVisible(c.format, feed))
    .sort((a, b) => a.platform.localeCompare(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

  return combos.map(({ platform, format }) => {
    const name = `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`;
    const window = content
      .filter((p) => p.platform === platform && p.format === format)
      .filter((p) => p.age_days >= RECENT_MIN_DAYS && p.age_days <= RECENT_MAX_DAYS)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    if (window.length === 0) {
      return { platform, format, name, state: "none", post: null, ratio: null, preliminary: false, highlight: false };
    }
    const top = window[0];
    const group = concepts.find((c) => sameGroup(c, top));
    const ratio = group?.median_views && top.views != null ? top.views / group.median_views : null;
    const state = window.length === 1 ? "single" : "best";
    const preliminary = group?.preliminary ?? false;
    const concept = top.concept ?? "Uten konsept";
    return {
      platform,
      format,
      name,
      state,
      post: {
        title: top.title?.split("\n")[0].trim() || "(uten tittel)",
        permalink: top.permalink,
        views: top.views,
        concept: top.special_event ? `${concept} (${top.special_event})` : concept,
        published: formatDayMonth(top.published_at),
      },
      ratio,
      preliminary,
      highlight: state === "best" && ratio != null && ratio >= 1 && !preliminary,
    };
  });
}
