// Følgere: totalen per plattform, netto endring i en periode og brutto nye som tilleggsinfo.
// Kilde: dashboard.followers. Én metode for alle plattformer:
//   netto = følgere ved periodens slutt − følgere ved utgangen av dagen før periodestart.
// Plattformene vises hver for seg. Totalen kan summeres på tvers (sum av kontoer, ikke unike personer),
// men netto summeres aldri på tvers, og det vises ingen prosent.

import type { FollowerRow, Platform } from "../data/types";
import { addDays, formatDayMonth } from "../format";
import { PLATFORM_ORDER } from "../navn";
import { expectedFollowerDays } from "../regler/folgertall";

export type StartValue = {
  value: number;
  /** Startverdien gjelder ved starten av denne datoen (= utgangen av dagen før). */
  date: string;
  source: string;
};

export type FollowerSeries = {
  platform: Platform;
  /** Målte totaler per dag (sortert). */
  points: { day: string; value: number }[];
  /** Brutto nye per dag (Instagram fra Meta, YouTube fra Analytics). Tom for TikTok. */
  gross: Map<string, number>;
  start: StartValue | null;
  takeover: string | null;
};

/** Én serie per plattform (fast rekkefølge). Plattformer uten noen rader utelates. */
export function buildFollowerSeries(rows: FollowerRow[]): FollowerSeries[] {
  const out: FollowerSeries[] = [];
  for (const platform of PLATFORM_ORDER) {
    const own = rows.filter((r) => r.platform === platform);
    if (!own.length) continue;
    const points = own
      .filter((r) => r.followers_count != null)
      .map((r) => ({ day: r.day, value: r.followers_count as number }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const gross = new Map<string, number>();
    for (const r of own) if (r.new_followers != null) gross.set(r.day, r.new_followers);
    const s = own.find((r) => r.followers_start != null && r.followers_start_date && r.followers_start_source);
    out.push({
      platform,
      points,
      gross,
      start: s ? { value: s.followers_start as number, date: s.followers_start_date as string, source: s.followers_start_source as string } : null,
      takeover: own.find((r) => r.takeover_date)?.takeover_date ?? null,
    });
  }
  return out;
}

/** Siste målte total, med dato. Null når plattformen ikke har noen måling. */
export function followersNow(s: FollowerSeries): { value: number; day: string } | null {
  const last = s.points.at(-1);
  return last ? { value: last.value, day: last.day } : null;
}

/**
 * «Følgere nå» summert over plattformene. Sum av kontoer, ikke unike personer. Bare totalen summeres
 * (aldri netto). Plattformer uten måling er ikke med, og antallet står i `platforms`.
 */
export function followersNowSum(series: FollowerSeries[]): { total: number; platforms: Platform[] } | null {
  const now = series.map((s) => [s.platform, followersNow(s)] as const).filter(([, v]) => v !== null);
  if (!now.length) return null;
  return { total: now.reduce((sum, [, v]) => sum + (v?.value ?? 0), 0), platforms: now.map(([p]) => p) };
}

export type Netto =
  /** Ingen måling i det hele tatt: «–». */
  | { kind: "none" }
  /** Første måling ligger etter periodens slutt, eller bare én måling i perioden: «ikke nok data». */
  | { kind: "notEnough" }
  | {
      kind: "value";
      change: number;
      from: number;
      to: number;
      /** Datoen netto gjelder fra: periodens start, startverdiens dato, eller første måling («målt fra»). */
      fromLabelDay: string;
      /** Netto dekker ikke hele perioden fra start: første måling ligger inne i perioden. */
      measuredFrom: boolean;
      /** Startverdien (followers_start) ble brukt som utgangspunkt. */
      start: StartValue | null;
      /** Siste måling som ble brukt. */
      toDay: string;
      /** Perioden er ikke ferdig («hittil»). */
      partial: boolean;
      /** Ferdig periode, men siste måling er før periodens slutt («t.o.m. dd.mm»). */
      throughEarly: boolean;
    };

/**
 * Netto i perioden [start, end]. today = dagens dato (Oslo); perioden er uferdig når end ≥ today.
 * Utgangspunktet er totalen ved utgangen av dagen før start: en måling den dagen, eller startverdien når
 * den gjelder fra periodestart. Mangler det, brukes første måling inne i perioden («målt fra dd.mm»).
 */
export function netto(s: FollowerSeries, start: string, end: string, today: string): Netto {
  if (!s.points.length && !s.start) return { kind: "none" };
  const before = addDays(start, -1);

  // Slutten: siste måling i perioden (startverdien er aldri en slutt).
  const to = s.points.filter((p) => p.day >= start && p.day <= end).at(-1);
  if (!to) return { kind: "notEnough" };

  // Utgangspunktet: målinger, pluss startverdien som en «måling» ved utgangen av dagen før startdatoen.
  // En ekte måling samme dag går foran startverdien.
  const startPoint = s.start ? { day: addDays(s.start.date, -1), value: s.start.value, isStart: true } : null;
  const candidates = [
    ...s.points.map((p) => ({ ...p, isStart: false })),
    ...(startPoint && !s.points.some((p) => p.day === startPoint.day) ? [startPoint] : []),
  ].sort((a, b) => a.day.localeCompare(b.day));
  const from = candidates.find((p) => p.day === before) ?? candidates.find((p) => p.day > before && p.day < to.day);
  if (!from) return { kind: "notEnough" };

  const usedStart = from.isStart;
  const measuredFrom = from.day !== before;
  return {
    kind: "value",
    change: to.value - from.value,
    from: from.value,
    to: to.value,
    fromLabelDay: usedStart ? (s.start as StartValue).date : measuredFrom ? from.day : start,
    measuredFrom,
    start: usedStart ? s.start : null,
    toDay: to.day,
    partial: end >= today,
    throughEarly: end < today && to.day < end,
  };
}

/** Brutto nye i perioden, med «nok data»-regelen som før (null når det mangler dager). */
export function grossInPeriod(s: FollowerSeries, start: string, end: string, today: string): number | null {
  if (!s.gross.size) return null;
  let sum = 0;
  let days = 0;
  for (const [day, value] of s.gross) {
    if (day >= start && day <= end) {
      sum += value;
      days += 1;
    }
  }
  const expected = expectedFollowerDays(
    { period_start: start, period_end: end, period_complete: end < today, days_with_follower_data: days },
    today,
  );
  return expected > 0 && days >= expected ? sum : null;
}

// --- Tekst -----------------------------------------------------------------------

const integer = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** «+10», «−2», «0». */
export function signed(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${integer.format(Math.abs(n))}`;
}

/**
 * Kort, forståelig etikett for startverdien, bygget fra followers_start_source:
 * «beregnet fra YouTube Analytics», «beregnet fra Meta Insikt», «beregnet fra TikTok Studio»,
 * «kontoen startet på 0» (kontoen ble opprettet med 0), ellers «startverdi oppgitt manuelt dd.mm».
 */
export function startLabel(start: StartValue): string {
  const source = start.source.toLowerCase();
  if (source.includes("youtube analytics")) return "beregnet fra YouTube Analytics";
  if (source.includes("meta insikt") || source.includes("meta insights")) return "beregnet fra Meta Insikt";
  if (source.includes("tiktok studio")) return "beregnet fra TikTok Studio";
  if (start.value === 0 && /opprettet|startet/.test(source)) return "kontoen startet på 0";
  return `startverdi oppgitt manuelt ${formatDayMonth(start.date)}`;
}

export type NettoView = {
  /** «+10», «ikke nok data» eller «–». */
  value: string;
  /** Står i selve tallraden: «målt fra 29.09», «fra 432 til 515», «hittil», «t.o.m. 12.10». */
  note: string | null;
  /** Etikett for startverdien, når den er brukt. */
  startLabel: string | null;
};

/** Visning av netto i en periode (Uke/Måned). */
export function nettoView(n: Netto): NettoView {
  if (n.kind === "none") return { value: "–", note: null, startLabel: null };
  if (n.kind === "notEnough") return { value: "ikke nok data", note: null, startLabel: null };
  const notes: string[] = [];
  if (n.start) notes.push(`fra ${integer.format(n.from)} til ${integer.format(n.to)}`);
  else if (n.measuredFrom) notes.push(`målt fra ${formatDayMonth(n.fromLabelDay)}`);
  if (n.partial) notes.push("hittil");
  else if (n.throughEarly) notes.push(`t.o.m. ${formatDayMonth(n.toDay)}`);
  return { value: signed(n.change), note: notes.length ? notes.join(", ") : null, startLabel: n.start ? startLabel(n.start) : null };
}

/** Total-kortet: «+10 siden 29.09» (målt fra) eller «+40 siden 15.06» (startverdi eller hele perioden). */
export function sinceStartText(n: Netto): string | null {
  if (n.kind !== "value") return null;
  return `${signed(n.change)} siden ${formatDayMonth(n.fromLabelDay)}`;
}
