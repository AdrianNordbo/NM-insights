// «Hvilket konsept bør vi lage mer av?»: én blokk per plattform og format fra dashboard.concept_summary
// (median, bare innlegg som er minst 7 dager gamle). Sammenlign bare innenfor samme blokk.

import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";
import { daysInclusive, formatDayMonth } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME } from "../navn";
import { formatVisible } from "./adresse";

export const BEFORE_CONCEPTS = "Før konsepter";
/** Et konsept er inaktivt når det har gått så mange dager eller mer siden siste innlegg. */
export const INACTIVE_AFTER_DAYS = 21;
export const SPARK_POSTS = 10;

export type ConceptStatus = "aktiv" | "inaktiv" | "forelopig";

export type SparkPoint = { key: string; label: string; value: number };

export type ConceptLine = {
  concept: string;
  posts: number;
  medianViews: number | null;
  engagement: number | null;
  status: ConceptStatus;
  /** Dato for siste innlegg i konseptet (lokal Oslo-tid). */
  lastPublished: string | null;
  /** Visningene til de siste 10 modne innleggene, eldst først. */
  spark: SparkPoint[];
};

export type EventLine = {
  event: string;
  concept: string;
  posts: number;
  medianViews: number | null;
  engagement: number | null;
  preliminary: boolean;
};

export type ConceptBlock = {
  platform: Platform;
  format: Format;
  name: string;
  lines: ConceptLine[];
  events: EventLine[];
  /** Antall rader skjult fordi «Før konsepter» er av. */
  hidden: number;
};

/** Dager siden siste innlegg (publiseringsdato i Oslo-tid til i dag). */
export const daysSince = (lastPublished: string, today: string) => daysInclusive(lastPublished.slice(0, 10), today) - 1;

/** Aktiv = færre enn INACTIVE_AFTER_DAYS dager siden siste innlegg. Publiseres det igjen, blir konseptet aktivt igjen. */
export const isActive = (lastPublished: string, today: string) => daysSince(lastPublished, today) < INACTIVE_AFTER_DAYS;

const byViews = (a: ConceptLine, b: ConceptLine) => (b.medianViews ?? -1) - (a.medianViews ?? -1);

/** Siste 10 modne innlegg i konseptet (uten spesielle hendelser), eldst først. */
export function sparkFor(content: ContentLatestRow[], platform: Platform, format: Format, concept: string | null): SparkPoint[] {
  return content
    .filter((p) => p.platform === platform && p.format === format && p.concept === concept && !p.special_event && p.is_mature)
    .sort((a, b) => a.published_at.localeCompare(b.published_at))
    .slice(-SPARK_POSTS)
    .map((p) => ({
      key: p.content_id,
      label: `${formatDayMonth(p.published_at)} · ${p.title?.split("\n")[0].trim() || "(uten tittel)"}`,
      value: p.views ?? 0,
    }));
}

/**
 * Én blokk per plattform og format. Rekkefølge: aktive konsepter, så inaktive (ingen innlegg de
 * siste 21 dagene), så foreløpige (under 6 innlegg) nederst; innenfor hver gruppe etter median
 * visninger. Spesielle hendelser (special_event) ligger i egen liste. Feed bare med bryteren på.
 */
export function buildConceptBlocks(
  concepts: ConceptSummaryRow[],
  content: ContentLatestRow[],
  today: string,
  showBeforeConcepts: boolean,
  feed: boolean,
): ConceptBlock[] {
  const combos = [...new Map(concepts.map((c) => [`${c.platform}|${c.format}`, c])).values()]
    .map((c) => ({ platform: c.platform, format: c.format }))
    .filter((c) => formatVisible(c.format, feed))
    .sort((a, b) => a.platform.localeCompare(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

  return combos.map(({ platform, format }) => {
    const own = concepts.filter((c) => c.platform === platform && c.format === format);
    const regular = own.filter((c) => !c.special_event);
    const visible = regular.filter((c) => showBeforeConcepts || c.concept !== BEFORE_CONCEPTS);

    const lines: ConceptLine[] = visible.map((c) => {
      const last =
        content
          .filter((p) => p.platform === platform && p.format === format && p.concept === c.concept && !p.special_event)
          .map((p) => p.published_at)
          .sort()
          .at(-1) ?? null;
      const status: ConceptStatus = c.preliminary ? "forelopig" : last && isActive(last, today) ? "aktiv" : "inaktiv";
      return {
        concept: c.concept ?? "Uten konsept",
        posts: c.posts,
        medianViews: c.median_views,
        engagement: c.median_engagement_per_view,
        status,
        lastPublished: last,
        spark: sparkFor(content, platform, format, c.concept),
      };
    });

    const order: ConceptStatus[] = ["aktiv", "inaktiv", "forelopig"];
    lines.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || byViews(a, b));

    const events: EventLine[] = own
      .filter((c) => c.special_event)
      .map((c) => ({
        event: c.special_event!,
        concept: c.concept ?? "Uten konsept",
        posts: c.posts,
        medianViews: c.median_views,
        engagement: c.median_engagement_per_view,
        preliminary: c.preliminary,
      }));

    return {
      platform,
      format,
      name: `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`,
      lines,
      events,
      hidden: regular.length - visible.length,
    };
  });
}

/**
 * Stolpelengde i prosent. Skalaen settes av de ikke-foreløpige radene i blokken, så usikre tall
 * ikke dominerer; foreløpige rader kappes ved 100 %.
 */
export function barScale(lines: ConceptLine[], key: "medianViews" | "engagement"): (value: number | null) => number {
  const base = lines.some((l) => l.status !== "forelopig") ? lines.filter((l) => l.status !== "forelopig") : lines;
  const max = Math.max(0, ...base.map((l) => l[key] ?? 0));
  return (value) => (value == null || max <= 0 ? 0 : Math.min(100, Math.max(2, (value / max) * 100)));
}
