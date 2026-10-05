// Tilstanden på oversiktssiden ligger i adressen, så den kan deles og bokmerkes:
// ?periode=uke&p=2026-W39&feed=1. Feed er av som standard.

import type { PeriodType } from "../data/types";
import type { Series } from "./aktivitet";
import { currentPeriod, nextPeriod, parsePeriodKey, parsePeriodType, type Period, periodKey, prevPeriod } from "./periode";

export type SearchParams = Record<string, string | string[] | undefined>;

export type OversiktState = { period: Period; feed: boolean };

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
  const type: PeriodType = parsePeriodType(first(params.periode));
  const period = parsePeriodKey(type, first(params.p)) ?? currentPeriod(type, osloToday);
  return { period, feed };
}

export function hrefFor(state: OversiktState, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ periode: state.period.type, p: periodKey(state.period) });
  if (state.feed) q.set("feed", "1");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return `/?${q.toString()}`;
}

export type Navigation = {
  prev: string | null;
  next: string | null;
  /** Bytte til den andre periodetypen (standardperioden der). */
  week: string;
  month: string;
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
    prev: firstActive && prev.end >= firstActive ? hrefFor({ ...state, period: prev }) : null,
    next: next.start <= current.start ? hrefFor({ ...state, period: next }) : null,
    week: hrefFor({ ...state, period: currentPeriod("uke", osloToday) }),
    month: hrefFor({ ...state, period: currentPeriod("måned", osloToday) }),
    feedToggle: hrefFor({ ...state, feed: !state.feed }),
  };
}
