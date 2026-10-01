import { addDays } from "../format";
import { FORMAT_ORDER } from "../navn";
import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";

export const BEFORE_CONCEPTS = "Før konsepter";
export const ACTIVE_DAYS = 30;

export type ConceptStatus = "aktiv" | "avsluttet" | "forelopig";

export type ConceptLine = {
  concept: string;
  posts: number;
  medianViews: number | null;
  engagement: number | null;
  status: ConceptStatus;
  /** Dato for siste innlegg i konseptet (lokal Oslo-tid), for avsluttede konsepter. */
  lastPublished: string | null;
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
  lines: ConceptLine[];
  events: EventLine[];
  /** Antall rader skjult fordi «Før konsepter» er av. */
  hidden: number;
};

const byViews = (a: ConceptLine, b: ConceptLine) => (b.medianViews ?? -1) - (a.medianViews ?? -1);

/**
 * Én blokk per plattform og format. Rekkefølge: aktive konsepter, så avsluttede (ingen innlegg
 * siste 30 dager), så foreløpige (under 6 innlegg) nederst; innenfor hver gruppe etter median
 * visninger. Spesielle hendelser (special_event) ligger i egen liste.
 */
export function buildConceptBlocks(
  concepts: ConceptSummaryRow[],
  content: ContentLatestRow[],
  today: string,
  showBeforeConcepts: boolean,
): ConceptBlock[] {
  const activeFrom = addDays(today, -ACTIVE_DAYS);
  const combos = [...new Map(concepts.map((c) => [`${c.platform}|${c.format}`, c])).values()]
    .map((c) => ({ platform: c.platform, format: c.format }))
    .sort((a, b) => a.platform.localeCompare(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

  return combos.map(({ platform, format }) => {
    const own = concepts.filter((c) => c.platform === platform && c.format === format);
    const regular = own.filter((c) => !c.special_event);
    const visible = regular.filter((c) => showBeforeConcepts || c.concept !== BEFORE_CONCEPTS);

    const lines: ConceptLine[] = visible.map((c) => {
      const last = content
        .filter((p) => p.platform === platform && p.format === format && p.concept === c.concept && !p.special_event)
        .map((p) => p.published_at)
        .sort()
        .at(-1) ?? null;
      const status: ConceptStatus = c.preliminary
        ? "forelopig"
        : last && last.slice(0, 10) >= activeFrom
          ? "aktiv"
          : "avsluttet";
      return {
        concept: c.concept ?? "Uten konsept",
        posts: c.posts,
        medianViews: c.median_views,
        engagement: c.median_engagement_per_view,
        status,
        lastPublished: last,
      };
    });

    const order: ConceptStatus[] = ["aktiv", "avsluttet", "forelopig"];
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

    return { platform, format, lines, events, hidden: regular.length - visible.length };
  });
}
