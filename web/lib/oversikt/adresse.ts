// Tilstanden på oversiktssiden ligger i adressen, så den kan deles og bokmerkes:
// ?periode=uke&p=2026-W39&feed=1, eller ?periode=total. Feed er av som standard.

import type { PeriodType } from "../data/types";
import type { Series } from "./aktivitet";
import { currentPeriod, nextPeriod, parsePeriodKey, parsePeriodType, type Period, periodKey, prevPeriod } from "./periode";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * total = «Total»-valget (summen siden start). period brukes da ikke i toppfeltet, men settes til
 * inneværende uke så seksjonene som bygger på periode, alltid har en gyldig verdi.
 */
export type OversiktState = { period: Period; feed: boolean; total: boolean };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Feed vises bare når bryteren er på. Gjelder alle seksjoner på siden. */
export const formatVisible = (format: string, feed: boolean) => feed || format !== "FEED";

/** Serier som vises: Instagram Feed bare når bryteren er på. */
export function visibleSeries(series: Series[], feed: boolean): Series[] {
  return series.filter((s) => formatVisible(s.format, feed));
}

/** Leser adressen. Mangler eller ugyldig periode gir inneværende periode (Oslo-kalenderen). */
export function readState(params: SearchParams, osloToday: string): OversiktState {
  const feed = first(params.feed) === "1";
  if (first(params.periode) === "total") return { period: currentPeriod("uke", osloToday), feed, total: true };
  const type: PeriodType = parsePeriodType(first(params.periode));
  const period = parsePeriodKey(type, first(params.p)) ?? currentPeriod(type, osloToday);
  return { period, feed, total: false };
}

export function hrefFor(state: OversiktState, extra: Record<string, string> = {}): string {
  const q = state.total
    ? new URLSearchParams({ periode: "total" })
    : new URLSearchParams({ periode: state.period.type, p: periodKey(state.period) });
  if (state.feed) q.set("feed", "1");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return `/?${q.toString()}`;
}

export type Navigation = {
  prev: string | null;
  next: string | null;
  /** Bytte periodetype: Uke/Måned går til inneværende periode, Total til summen siden start. */
  week: string;
  month: string;
  total: string;
  feedToggle: string;
};

/**
 * Lenkene i toppfeltet. Bakover stopper ved første periode med data, fremover ved inneværende
 * periode. Uke/Måned går alltid til inneværende periode.
 */
export function navigation(state: OversiktState, series: Series[], osloToday: string): Navigation {
  const shown = visibleSeries(series, state.feed);
  const firstActive = shown.map((s) => s.firstActive).sort()[0];
  const prev = prevPeriod(state.period);
  const next = nextPeriod(state.period);
  const current = currentPeriod(state.period.type, osloToday);
  return {
    // Total har ingen piler.
    prev: !state.total && firstActive && prev.end >= firstActive ? hrefFor({ ...state, period: prev }) : null,
    next: !state.total && next.start <= current.start ? hrefFor({ ...state, period: next }) : null,
    week: hrefFor({ ...state, total: false, period: currentPeriod("uke", osloToday) }),
    month: hrefFor({ ...state, total: false, period: currentPeriod("måned", osloToday) }),
    total: hrefFor({ ...state, total: true }),
    feedToggle: hrefFor({ ...state, feed: !state.feed }),
  };
}
