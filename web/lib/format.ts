// Norsk tallformat og datoer i Europe/Oslo.

const TZ = "Europe/Oslo";
const integer = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("nb-NO", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "–" : integer.format(Math.round(value));
}

export function formatPercent(value: number | null | undefined): string {
  return value == null ? "–" : percent.format(value);
}

/** 1.43 → «×1,4» */
export function formatRatio(value: number): string {
  return `×${oneDecimal.format(value)}`;
}

/** Lokal Oslo-tid uten tidssone («2026-09-17T19:01:15») eller dato («2026-09-17») → «17.09». */
export function formatDayMonth(localIso: string): string {
  const [, month, day] = localIso.slice(0, 10).split("-");
  return `${day}.${month}`;
}

/** Periode som «14.–20.09», eller «28.09–04.10» når den går over et månedsskifte. */
export function formatRange(start: string, end: string): string {
  const [, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  return sm === em ? `${sd}.–${ed}.${em}` : `${sd}.${sm}–${ed}.${em}`;
}

/** timestamptz → «30.09 kl. 11:55» i Oslo-tid. */
export function formatFetched(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("nb-NO", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").padStart(2, "0");
  return `${get("day")}.${get("month")} kl. ${get("hour")}:${get("minute")}`;
}

/** Dagens dato i Oslo, «YYYY-MM-DD». Bestemmer hvilken uke/måned som er inneværende. */
export function osloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Dagens dato i Stillehavstid, «YYYY-MM-DD». Plattformenes døgn (Meta og YouTube Analytics) følger denne. */
export function pacificToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

/** Dagens dato i UTC, «YYYY-MM-DD». TikToks døgn følger denne. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Legger til dager på en dato «YYYY-MM-DD». */
export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Antall dager fra start til og med slutt. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000) + 1;
}

/** ISO-ukenummer for en dato «YYYY-MM-DD». */
export function isoWeek(date: string): number {
  const d = toUtc(date);
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const twoDecimals = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1.309 → «1,31» (ganger vanlig, heatmap) */
export function formatTimes(value: number): string {
  return twoDecimals.format(value);
}

/** Andel 0.0156 → «1,56 %» (engasjementsrate) */
export function formatShare(value: number | null | undefined): string {
  return value == null ? "–" : `${twoDecimals.format(value * 100)} %`;
}

/** Endring i andel 0.0087 → «+0,87 pp», −0.0002 → «−0,02 pp» */
export function formatPp(diff: number): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return `${sign}${twoDecimals.format(Math.abs(diff * 100))} pp`;
}
