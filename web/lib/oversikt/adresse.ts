// Tilstanden på oversiktssiden ligger i adressen, så den kan deles og bokmerkes:
// ?periode=uke&p=2026-W39&feed=1. Feed er av som standard.

import type { PeriodType } from "../data/types";
import type { Series } from "./aktivitet";
import { defaultPeriod, nextPeriod, parsePeriodKey, parsePeriodType, type Period, periodKey, prevPeriod } from "./periode";

export type SearchParams = Record<string, string | string[] | undefined>;

export type OversiktState = { period: Period; feed: boolean };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Feed vises bare når bryteren er på. Gjelder alle seksjoner på siden. */
export const formatVisible = (format: string, feed: boolean) => feed || format !== "FEED";

/** Serier som vises: Instagram Feed bare når bryteren er på. */
export function visibleSeries(series: Series[], feed: boolean): Series[] {
  return series.filter((s) => formatVisible(s.format, feed));
}

/** Leser adressen. Mangler eller ugyldig periode gir standardperioden. */
export function readState(params: SearchParams, series: Series[]): OversiktState {
  const feed = first(params.feed) === "1";
  const type: PeriodType = parsePeriodType(first(params.periode));
  const shown = visibleSeries(series, feed);
  const period =
    parsePeriodKey(type, first(params.p)) ??
    defaultPeriod(type, shown.length ? shown.map((s) => s.through) : [new Date().toISOString().slice(0, 10)]);
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
 * Lenkene i toppfeltet. Bakover stopper ved første periode med data, fremover ved perioden
 * som inneholder siste døgn med data.
 */
export function navigation(state: OversiktState, series: Series[]): Navigation {
  const shown = visibleSeries(series, state.feed);
  const firstActive = shown.map((s) => s.firstActive).sort()[0];
  const lastThrough = shown.map((s) => s.through).sort().at(-1);
  const prev = prevPeriod(state.period);
  const next = nextPeriod(state.period);
  const through = (feed: boolean) => visibleSeries(series, feed).map((s) => s.through);
  return {
    prev: firstActive && prev.end >= firstActive ? hrefFor({ ...state, period: prev }) : null,
    next: lastThrough && next.start <= lastThrough ? hrefFor({ ...state, period: next }) : null,
    week: hrefFor({ ...state, period: defaultPeriod("uke", through(state.feed)) }),
    month: hrefFor({ ...state, period: defaultPeriod("måned", through(state.feed)) }),
    feedToggle: hrefFor({ ...state, feed: !state.feed }),
  };
}
