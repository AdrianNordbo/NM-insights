// Perioder (uke/måned) og hvordan de står i adressen: ?periode=uke&p=2026-W39 eller ?periode=måned&p=2026-09.
// Datoene er plattformenes døgn (Stillehavstid), som i dashboard.daily_activity.

import type { PeriodType } from "../data/types";
import { addDays, formatDayMonth, isoWeek } from "../format";

export type Period = {
  type: PeriodType;
  /** "YYYY-MM-DD" */
  start: string;
  end: string;
};

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7; // mandag = 1, søndag = 7
}

/** Perioden datoen ligger i. */
export function periodOf(type: PeriodType, date: string): Period {
  if (type === "uke") {
    const start = addDays(date, 1 - weekday(date));
    return { type, start, end: addDays(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const [y, m] = start.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { type, start, end: addDays(next, -1) };
}

export const prevPeriod = (p: Period): Period => periodOf(p.type, addDays(p.start, -1));
export const nextPeriod = (p: Period): Period => periodOf(p.type, addDays(p.end, 1));

/** ISO-uke-år: året torsdagen i uken ligger i. */
function isoWeekYear(date: string): number {
  return Number(addDays(date, 4 - weekday(date)).slice(0, 4));
}

/** Nøkkelen i adressen: «2026-W39» eller «2026-09». */
export function periodKey(p: Period): string {
  if (p.type === "måned") return p.start.slice(0, 7);
  return `${isoWeekYear(p.start)}-W${String(isoWeek(p.start)).padStart(2, "0")}`;
}

/** Leser nøkkelen fra adressen. Ugyldig nøkkel gir null. */
export function parsePeriodKey(type: PeriodType, key: string | undefined): Period | null {
  if (!key) return null;
  if (type === "måned") {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return periodOf("måned", `${key}-01`);
  }
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const week = Number(m[2]);
  // Uke 1 er uken med 4. januar.
  const week1 = periodOf("uke", `${m[1]}-01-04`);
  const p = periodOf("uke", addDays(week1.start, (week - 1) * 7));
  return week >= 1 && periodKey(p) === key ? p : null;
}

export function parsePeriodType(value: string | undefined): PeriodType {
  return value === "måned" || value === "maned" ? "måned" : "uke";
}

/**
 * Inneværende periode: uken eller måneden dagens dato (Oslo-kalenderen) ligger i. Dette er
 * standardperioden på Oversikt, uansett hvor langt plattformenes data rekker.
 */
export function currentPeriod(type: PeriodType, osloToday: string): Period {
  return periodOf(type, osloToday);
}

/** «Uke 39 · 21.09–27.09» eller «September 2026». */
export function periodLabel(p: Period): string {
  if (p.type === "uke") return `Uke ${isoWeek(p.start)} · ${formatDayMonth(p.start)}–${formatDayMonth(p.end)}`;
  const name = MONTHS[Number(p.start.slice(5, 7)) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${p.start.slice(0, 4)}`;
}

/** Kort navn til sammenligninger: «uke 38» eller «august». */
export function periodShortLabel(p: Period): string {
  return p.type === "uke" ? `uke ${isoWeek(p.start)}` : MONTHS[Number(p.start.slice(5, 7)) - 1];
}

/** «Siste 12 uker» / «Siste 12 måneder». */
export function trendLabel(type: PeriodType, n: number): string {
  return `Siste ${n} ${type === "uke" ? "uker" : "måneder"}`;
}

/** De n siste periodene til og med p, eldst først. */
export function periodsBack(p: Period, n: number): Period[] {
  const out = [p];
  while (out.length < n) out.unshift(prevPeriod(out[0]));
  return out;
}
