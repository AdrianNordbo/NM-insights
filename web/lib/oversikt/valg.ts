// Periodevalget i nedtrekket og adressen (?plattform=…&periode=…). Standard: Alle og Total.
// Kalenderperioder følger Oslo-kalenderen; rullerende perioder slutter på siste døgn med data.

import { addDays, formatDayMonth } from "../format";
import { plattformValg, type PlattformValgDef } from "../regler/plattformer";

export type PeriodeKey =
  | "denne-uken"
  | "forrige-uke"
  | "denne-maaneden"
  | "forrige-maaned"
  | "siste-7"
  | "siste-30"
  | "siste-90"
  | "total";

export const STANDARD_PERIODE: PeriodeKey = "total";

export type PeriodeDef =
  | { key: PeriodeKey; label: string; kind: "calendar"; start: string; end: string }
  | { key: PeriodeKey; label: string; kind: "rolling"; days: number }
  | { key: PeriodeKey; label: string; kind: "total" };

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

const weekdayMon0 = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const nextMonthStart = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/** Alle valgene i nedtrekket, med datoer for kalenderperiodene. today = dagens Oslo-dato. */
export function perioder(today: string): PeriodeDef[] {
  const weekStart = addDays(today, -weekdayMon0(today));
  const ms = monthStart(today);
  const prevEnd = addDays(ms, -1);
  const prevStart = monthStart(prevEnd);
  return [
    { key: "total", label: "Total siden start", kind: "total" },
    { key: "denne-uken", label: "Denne uken", kind: "calendar", start: weekStart, end: addDays(weekStart, 6) },
    { key: "forrige-uke", label: "Forrige uke", kind: "calendar", start: addDays(weekStart, -7), end: addDays(weekStart, -1) },
    { key: "denne-maaneden", label: `Denne måneden (${MONTHS[+today.slice(5, 7) - 1]})`, kind: "calendar", start: ms, end: addDays(nextMonthStart(today), -1) },
    { key: "forrige-maaned", label: `Forrige måned (${MONTHS[+prevStart.slice(5, 7) - 1]})`, kind: "calendar", start: prevStart, end: prevEnd },
    { key: "siste-7", label: "Siste 7 dager", kind: "rolling", days: 7 },
    { key: "siste-30", label: "Siste 30 dager", kind: "rolling", days: 30 },
    { key: "siste-90", label: "Siste 90 dager", kind: "rolling", days: 90 },
  ];
}

export function periodeValg(key: string | string[] | undefined, today: string): PeriodeDef {
  const k = Array.isArray(key) ? key[0] : key;
  const all = perioder(today);
  return all.find((p) => p.key === k) ?? (all.find((p) => p.key === STANDARD_PERIODE) as PeriodeDef);
}

export type Omraade = {
  start: string;
  /** Siste døgn som er med (aldri forbi siste døgn med data). */
  end: string;
  /** Minst ett døgn med data i perioden. */
  has: boolean;
  days: number;
  /** «12.10–18.10», «siden 15.06» */
  label: string;
};

const range = (a: string, b: string) => (a === b ? formatDayMonth(a) : `${formatDayMonth(a)}–${formatDayMonth(b)}`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;

/**
 * Datoene en periode dekker, gitt siste døgn med data (last) og startdatoen for Total (takeover).
 * Kalenderperioder kuttes ved siste døgn; rullerende slutter på siste døgn.
 */
export function omraade(p: PeriodeDef, last: string, takeover: string): Omraade {
  let start: string, end: string, label: string;
  if (p.kind === "calendar") {
    start = p.start;
    end = p.end < last ? p.end : last;
    label = range(p.start, p.end);
  } else if (p.kind === "rolling") {
    end = last;
    start = addDays(last, -(p.days - 1));
    label = range(start, end);
  } else {
    start = takeover;
    end = last;
    label = `siden ${formatDayMonth(takeover)}`;
  }
  const has = end >= start;
  return { start, end, has, days: has ? daysBetween(start, end) : 0, label };
}

/** Like mange dager rett før. */
export function forrigeOmraade(o: Omraade): { start: string; end: string; label: string } | null {
  if (!o.has) return null;
  const start = addDays(o.start, -o.days);
  const end = addDays(o.start, -1);
  return { start, end, label: `${range(start, end)} (${o.days} ${o.days === 1 ? "dag" : "dager"} før)` };
}

export type Valg = { plattform: PlattformValgDef; periode: PeriodeDef };

export function lesValg(params: Record<string, string | string[] | undefined>, today: string): Valg {
  return { plattform: plattformValg(params.plattform), periode: periodeValg(params.periode, today) };
}

/** Adressen for et valg. Standardverdiene skrives også, så adressen alltid viser valget. */
export function valgHref(path: string, v: { plattform: string; periode?: string }, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ plattform: v.plattform, ...(v.periode ? { periode: v.periode } : {}), ...extra });
  return `${path}?${q.toString()}`;
}
