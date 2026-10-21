// Utkast til publiseringsplan. Regelbasert og bare et forslag: ingenting publiseres automatisk.
//
// - Du bestemmer videoene (miks og antall). Utkastet velger bare dag og klokkeslett (Oslo-tid).
// - Hver avhuket plattform gir én plassering per video. Plattformene plasseres hver for seg etter egne tall,
//   og på samme dag som videoens første plattform der det er mulig.
// - «Basert på data»: tidsrom (ukedag × tidsblokk) der samme type innhold har minst HEAT_MIN_N innlegg på
//   plattformen, på klokkeslettet som er brukt der før. «Test»: kveldstidsrom uten nok tall, høyst
//   testerPerUke per plattform og uke (maks 2).
// - Konsept med brudd (Folka Først fra 19.10) holder fast tidspunkt i LAAS_UKER uker på alle plattformer og
//   brukes aldri til tester i den perioden.
// - Maks per dag, minste mellomrom og én video per konsept og dag gjelder per plattform.

import { dataCeller, HEAT_MIN_N, type HeatSection, TIDSBLOKKER, UKEDAGER_LANG } from "../analyse/heatmap";
import { addDays, formatDayMonth } from "../format";
import { bruddNavn, KONSEPTBRUDD, type Konseptbrudd, laasPeriode } from "../regler/konsepter";
import { PLAN_PLATTFORMER, type PlanPlattform } from "../regler/plattformer";

export const MAKS_TESTER_PER_UKE = 2;
export const OPPFOLGING_DAGER = 7;

export type KoVideo = { id: string; title: string; concept: string; platforms: string[] };
export type Regler = { start: string; horizon: number; maxPerDay: number; gapHours: number; testsPerWeek: number };
export type Merking = "Basert på data" | "Test";
export type Plassering = {
  videoId: string;
  title: string;
  concept: string;
  platform: string;
  platformLabel: string;
  date: string;
  time: string;
  kind: Merking;
  why: string;
  weekday: number;
  block: number;
  /** Tester følges opp 7 dager etter publisering. */
  followUp: string | null;
};
export type Utkast = { days: string[]; placed: Plassering[]; unplaced: { video: KoVideo; platform: PlanPlattform; reason: string }[] };

export const ukedag = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
export const ukeStart = (iso: string) => addDays(iso, -ukedag(iso));
const toMin = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/** 19:01 → 19:00 */
export function round5(hm: string): string {
  const m = Math.round(toMin(hm) / 5) * 5;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function lagUtkast(
  queue: KoVideo[],
  regler: Regler,
  /** Heatmap per planleggingsplattform (nøkkel = PlanPlattform.key). */
  heat: Record<string, HeatSection | undefined>,
  /** Dagens Oslo-dato: utkastet starter tidligst i morgen. */
  today: string,
  brudd: readonly Konseptbrudd[] = KONSEPTBRUDD,
): Utkast {
  const first = regler.start > today ? regler.start : addDays(today, 1);
  const days = Array.from({ length: regler.horizon }, (_, i) => addDays(first, i));
  const testsPerWeek = Math.max(0, Math.min(MAKS_TESTER_PER_UKE, regler.testsPerWeek));
  const placed: Plassering[] = [];
  const unplaced: Utkast["unplaced"] = [];

  const free = (platform: string, date: string, time: string, concept: string) => {
    const same = placed.filter((p) => p.platform === platform && p.date === date);
    if (same.length >= regler.maxPerDay) return false;
    if (same.some((p) => p.concept === concept)) return false;
    return !same.some((p) => Math.abs(toMin(p.time) - toMin(time)) < regler.gapHours * 60);
  };
  const testsIn = (platform: string, date: string) => placed.filter((p) => p.platform === platform && p.kind === "Test" && ukeStart(p.date) === ukeStart(date)).length;

  for (const video of queue) {
    const b = brudd.find((x) => x.concept === video.concept);
    const lock = b ? laasPeriode(b) : null;
    const locked = (date: string) => !!lock && date >= lock.from && date <= lock.to;
    let anchor: string | null = null; // dagen videoens første plattform fikk

    for (const pp of PLAN_PLATTFORMER.filter((p) => video.platforms.includes(p.key))) {
      const sec = heat[pp.key];
      const name = `${pp.label}`;
      // Etter låsen brukes tallene for den nye gruppen når de finnes, ellers tallene fra før bruddet.
      const afterBreak = b ? dataCeller(sec, bruddNavn(b)) : [];
      const cellsFor = (date: string) => (b && !locked(date) && date > (lock?.to ?? "") && afterBreak.length ? afterBreak : dataCeller(sec, video.concept));
      const ordered = (date: string) => cellsFor(date).slice().sort((x, y) => y.median - x.median || y.n - x.n);
      const lockCells = (date: string) => {
        const c = dataCeller(sec, video.concept).sort((x, y) => y.n - x.n);
        return c.filter((x) => c.length && x.n >= c[0].n * 0.6).filter((x) => x.weekday === ukedag(date));
      };
      const label = (w: number, bl: number) => `${UKEDAGER_LANG[w]} ${TIDSBLOKKER[bl].label}`;

      const dataOn = (date: string): Plassering | null => {
        const pool = locked(date) ? lockCells(date) : ordered(date).filter((c) => c.weekday === ukedag(date));
        const c = pool.find((x) => free(pp.key, date, round5(x.time), video.concept));
        if (!c) return null;
        const why = locked(date)
          ? `Fast tidspunkt for ${video.concept} på alle plattformer fra ${formatDayMonth(lock!.from)} til ${formatDayMonth(lock!.to)} (${b!.reason}): ${label(c.weekday, c.block)}, ${c.n} innlegg på ${name}.`
          : `${video.concept} på ${name}, ${label(c.weekday, c.block)}: ${c.median.toFixed(2).replace(".", ",")} ganger vanlig, ${c.n} innlegg.`;
        return mk(video, pp, date, round5(c.time), "Basert på data", why, c.weekday, c.block);
      };
      const testOn = (date: string): Plassering | null => {
        if (locked(date) || testsIn(pp.key, date) >= testsPerWeek) return null;
        for (let bl = TIDSBLOKKER.length - 1; bl >= 2; bl--) {
          const cell = sec?.grids[video.concept]?.[ukedag(date)]?.[bl];
          const n = cell?.n ?? 0;
          const time = round5(cell?.time ?? TIDSBLOKKER[bl].defaultTime);
          if (n < HEAT_MIN_N && free(pp.key, date, time, video.concept))
            return mk(video, pp, date, time, "Test", `Få eller ingen tall for ${video.concept} på ${name}, ${label(ukedag(date), bl)} (${n} innlegg). Følges opp ${formatDayMonth(addDays(date, OPPFOLGING_DAGER))}.`, ukedag(date), bl);
        }
        return null;
      };

      let choice: Plassering | null = null;
      // Samme dag som videoens første plattform, der det er mulig
      if (anchor) choice = dataOn(anchor) ?? (dataCeller(sec, video.concept).length ? null : testOn(anchor));
      // Ellers: første ledige dag i et tidsrom med data (fra videoens første dag, deretter før)
      const order = anchor ? [...days.filter((d) => d >= anchor!), ...days.filter((d) => d < anchor!)] : days;
      if (!choice) for (const d of order) if ((choice = dataOn(d))) break;
      // Test i en celle uten data samme ukedag, når uka har plass til det
      if (choice && choice.kind === "Basert på data" && !locked(choice.date) && !anchor) {
        const t = testOn(choice.date);
        if (t) choice = t;
      }
      // Ingen tidsrom med data for typen innhold: bare test
      if (!choice) for (const d of order) if ((choice = testOn(d))) break;

      if (choice) {
        placed.push(choice);
        anchor = anchor ?? choice.date;
      } else
        unplaced.push({
          video,
          platform: pp,
          reason: dataCeller(sec, video.concept).length
            ? "ingen ledig plass i tidsrommene med tall i perioden"
            : "ingen tidsrom med tall for typen innhold, og ingen plass til flere tester",
        });
    }
  }
  placed.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.platform.localeCompare(b.platform));
  return { days, placed, unplaced };
}

function mk(video: KoVideo, pp: PlanPlattform, date: string, time: string, kind: Merking, why: string, weekday: number, block: number): Plassering {
  return {
    videoId: video.id,
    title: video.title,
    concept: video.concept,
    platform: pp.key,
    platformLabel: pp.label,
    date,
    time,
    kind,
    why,
    weekday,
    block,
    followUp: kind === "Test" ? addDays(date, OPPFOLGING_DAGER) : null,
  };
}

/** CSV-utkast: én rad per plattform, semikolon, BOM for Excel. */
export function utkastCsv(placed: Plassering[]): string {
  const rows = [
    ["Dato", "Ukedag", "Klokkeslett (Oslo)", "Plattform", "Tittel", "Type innhold", "Merking", "Grunnlag"],
    ...placed.map((p) => [p.date, UKEDAGER_LANG[p.weekday], p.time, p.platformLabel, p.title, p.concept, p.kind, p.why]),
  ];
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
