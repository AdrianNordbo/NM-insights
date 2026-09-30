import { addDays, isoWeek } from "../format";
import { hasEnoughFollowerData } from "../regler/folgertall";
import type { Format, Platform, PlatformSummaryRow } from "../data/types";

export const FORMAT_ORDER: Format[] = ["REELS", "FEED", "SHORTS"];

export type FormatWeek = {
  format: Format;
  published: number;
  prevPublished: number | null;
  medianViews: number | null;
  prevMedianViews: number | null;
};

export type PlatformCardData = {
  platform: Platform;
  followersTotal: number | null;
  week: {
    start: string;
    end: string;
    number: number;
    prevNumber: number;
    newFollowers: number | null;
    enoughFollowerData: boolean;
    formats: FormatWeek[];
  } | null;
};

/**
 * Ett kort per plattform. Uken er den siste der alle formater på plattformen er modne
 * (mature_posts = published) og minst ett innlegg er publisert, så tallene kan sammenlignes
 * med uken før. Følgertall gjelder hele kontoen og står øverst på kortet.
 */
export function buildPlatformCards(rows: PlatformSummaryRow[], today: string): PlatformCardData[] {
  const weeks = rows.filter((r) => r.period_type === "uke");
  const platforms = [...new Set(weeks.map((r) => r.platform))].sort();

  return platforms.map((platform) => {
    const own = weeks.filter((r) => r.platform === platform);
    const byWeek = new Map<string, PlatformSummaryRow[]>();
    for (const row of own) byWeek.set(row.period_start, [...(byWeek.get(row.period_start) ?? []), row]);

    const chosen = [...byWeek.keys()]
      .sort()
      .reverse()
      .map((start) => byWeek.get(start)!)
      .find((rs) => rs.every((r) => r.mature_posts === r.published) && rs.some((r) => r.published > 0));

    const latestFollowers = own
      .filter((r) => r.followers_end != null)
      .sort((a, b) => b.period_start.localeCompare(a.period_start))[0];

    if (!chosen) return { platform, followersTotal: latestFollowers?.followers_end ?? null, week: null };

    const first = chosen[0];
    const number = isoWeek(first.period_start);
    return {
      platform,
      followersTotal: latestFollowers?.followers_end ?? null,
      week: {
        start: first.period_start,
        end: first.period_end,
        number,
        prevNumber: isoWeek(addDays(first.period_start, -7)),
        newFollowers: first.new_followers,
        enoughFollowerData: hasEnoughFollowerData(first, today),
        formats: [...chosen]
          .sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format))
          .map((r) => ({
            format: r.format,
            published: r.published,
            prevPublished: r.prev_published,
            medianViews: r.median_views,
            prevMedianViews: r.prev_median_views,
          })),
      },
    };
  });
}
