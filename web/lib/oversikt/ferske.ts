// «Ferske innlegg»: innlegg under 7 dager gamle, som et tidlig signal (tallene er ikke endelige).
// Gruppert per plattform og format, nyeste først. Aldri sortert på visninger på tvers av plattformer.

import type { ContentLatestRow, Format, Platform } from "../data/types";
import { formatDayMonth } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME } from "../navn";
import { formatVisible } from "./adresse";

export const FRESH_MAX_DAYS = 7;

export type FreshPost = {
  id: string;
  title: string;
  permalink: string | null;
  /** «24.09» */
  published: string;
  /** «i dag», «1 dag gammel», «6 dager gammel» */
  age: string;
  views: number | null;
  concept: string | null;
  specialEvent: string | null;
};

export type FreshGroup = { id: string; platform: Platform; format: Format; name: string; posts: FreshPost[] };

export function ageText(ageDays: number): string {
  const days = Math.floor(ageDays);
  return days <= 0 ? "i dag" : days === 1 ? "1 dag gammel" : `${days} dager gammel`;
}

export function freshGroups(content: ContentLatestRow[], feed: boolean): FreshGroup[] {
  const fresh = content.filter((x) => x.age_days < FRESH_MAX_DAYS && formatVisible(x.format, feed));
  const groups: FreshGroup[] = [];
  for (const platform of ["instagram", "youtube"] as Platform[]) {
    for (const format of FORMAT_ORDER) {
      const own = fresh
        .filter((x) => x.platform === platform && x.format === format)
        .sort((a, b) => b.published_at.localeCompare(a.published_at));
      if (!own.length) continue;
      groups.push({
        id: `${platform}-${format}`,
        platform,
        format,
        name: `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`,
        posts: own.map((x) => ({
          id: x.content_id,
          title: x.title?.split("\n")[0].trim() || "(uten tittel)",
          permalink: x.permalink,
          published: formatDayMonth(x.published_at),
          age: ageText(x.age_days),
          views: x.views,
          concept: x.concept,
          specialEvent: x.special_event,
        })),
      });
    }
  }
  return groups;
}
