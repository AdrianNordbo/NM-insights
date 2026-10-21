// ISO-uker (mandag–søndag) for den delte kalenderen. Datoer er Oslo-datoer «YYYY-MM-DD».

import { addDays, formatDayMonth } from "../format";

export type Uke = { aar: number; uke: number };

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** ISO-uken datoen ligger i (uke-året er året torsdagen ligger i). */
export function isoUke(date: string): Uke {
  const d = utc(date);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = mandag
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dow + 3);
  const aar = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(aar, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  return { aar, uke: Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 864e5)) + 1 };
}

/** Mandagen i ISO-uken. */
export function mandag(u: Uke): string {
  const jan4 = new Date(Date.UTC(u.aar, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  return addDays(iso(week1Monday), (u.uke - 1) * 7);
}

/** De sju datoene i uken, mandag først. */
export const ukeDager = (u: Uke) => Array.from({ length: 7 }, (_, i) => addDays(mandag(u), i));

/** Antall ISO-uker i året (52 eller 53). */
export const ukerIAar = (aar: number) => isoUke(`${aar}-12-28`).uke;

export const gyldigUke = (u: Uke) => Number.isInteger(u.aar) && Number.isInteger(u.uke) && u.uke >= 1 && u.uke <= ukerIAar(u.aar);

/** «2026-W45» */
export const ukeKey = (u: Uke) => `${u.aar}-W${String(u.uke).padStart(2, "0")}`;

export function lesUke(key: string | null | undefined): Uke | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key ?? "");
  if (!m) return null;
  const u = { aar: Number(m[1]), uke: Number(m[2]) };
  return gyldigUke(u) ? u : null;
}

/** «Uke 45 · 02.11–08.11» (med år når uken går over et årsskifte eller ikke er i år). */
export function ukeLabel(u: Uke, today?: string): string {
  const d = ukeDager(u);
  const year = today && today.slice(0, 4) === String(u.aar) && d[6].slice(0, 4) === String(u.aar) ? "" : ` ${u.aar}`;
  return `Uke ${u.uke}${year} · ${formatDayMonth(d[0])}–${formatDayMonth(d[6])}`;
}

/** n uker fra og med uken today ligger i. */
export function kommendeUker(today: string, n: number): Uke[] {
  return Array.from({ length: n }, (_, i) => isoUke(addDays(mandag(isoUke(today)), i * 7)));
}

export const sammeUke = (a: Uke, b: Uke) => a.aar === b.aar && a.uke === b.uke;
