// Den delte kalenderen: hver video planlegges i en valgt ISO-uke, aldri utenfor. Én rad per plattform lagres i
// public.planned_posts (lesing via dashboard.planned_posts, skriving via funksjonene i schema planlegging).
// Er uken full, blir plattformen «ikke plassert» i den uken; den flyttes aldri til en annen uke.

import type { HeatSection } from "../analyse/heatmap";
import { UKEDAGER_LANG } from "../analyse/heatmap";
import { formatDayMonth } from "../format";
import { bruddFor, bruddNavn, KONSEPTBRUDD } from "../regler/konsepter";
import { STATUSER, type Status, UKEMIKS } from "../regler/plan";
import { PLAN_PLATTFORMER } from "../regler/plattformer";
import { isoUke, sammeUke, type Uke, ukeDager } from "./uke";
import { type KoVideo, lagUtkast, type Merking, type Regler } from "./utkast";

export type PlanRad = {
  id: string;
  videoId: string;
  aar: number;
  uke: number;
  tittel: string;
  /** Visningsnavn: «Folka Først (fra 19.10)» for plasseringer fra bruddatoen. */
  konsept: string;
  plattform: string;
  /** null = ikke plassert i uken. */
  dato: string | null;
  klokkeslett: string | null;
  merking: Merking | null;
  grunnlag: string;
  status: Status;
  flyttetManuelt: boolean;
};

/** En ny rad som skal lagres (id, status og flyttet_manuelt settes av databasen). */
export type NyRad = Omit<PlanRad, "id" | "status" | "flyttetManuelt">;

/** «Folka Først» → «Folka Først (fra 19.10)» når datoen er fra bruddatoen. */
export function konseptNavn(konsept: string, dato: string | null): string {
  if (!dato) return konsept;
  const b = bruddFor(konsept, dato);
  return b ? bruddNavn(b) : konsept;
}

/** «Folka Først (fra 19.10)» → «Folka Først». */
export function grunnKonsept(navn: string): string {
  return KONSEPTBRUDD.find((b) => bruddNavn(b) === navn)?.concept ?? navn;
}

export type UkeRegler = Pick<Regler, "maxPerDay" | "gapHours" | "testsPerWeek">;

/**
 * Plasserer én video (alle avhukede plattformer) innenfor uken, med radene som allerede ligger i uken som opptatt.
 * Bare dager etter i dag brukes. Gir én rad per plattform; uten plass blir raden ikke plassert (dato null).
 */
export function plasserIUke(
  video: KoVideo,
  uke: Uke,
  eksisterende: PlanRad[],
  regler: UkeRegler,
  heat: Record<string, HeatSection | undefined>,
  today: string,
): NyRad[] {
  const days = ukeDager(uke);
  const occupied = eksisterende
    .filter((r) => r.dato && r.klokkeslett && sammeUke(r, uke))
    .map((r) => ({
      platform: r.plattform,
      date: r.dato as string,
      time: r.klokkeslett as string,
      concept: grunnKonsept(r.konsept),
      kind: (r.merking ?? "Basert på data") as Merking,
    }));
  const u = lagUtkast([video], { start: days[0], horizon: 7, ...regler }, heat, today, KONSEPTBRUDD, { days, occupied });
  const base = { videoId: video.id, aar: uke.aar, uke: uke.uke, tittel: video.title };
  const order = (k: string) => PLAN_PLATTFORMER.findIndex((p) => p.key === k);
  return [
    ...u.placed.map((p) => ({ ...base, konsept: konseptNavn(video.concept, p.date), plattform: p.platform, dato: p.date, klokkeslett: p.time, merking: p.kind, grunnlag: p.why })),
    ...u.unplaced.map((x) => ({ ...base, konsept: video.concept, plattform: x.platform.key, dato: null, klokkeslett: null, merking: null, grunnlag: `Ikke plassert: ${x.reason}.` })),
  ].sort((a, b) => order(a.plattform) - order(b.plattform));
}

/** Miksen i uken: antall videoer (ikke plasseringer) per type innhold mot UKEMIKS. */
export function miks(uke: Uke, rader: PlanRad[]): { konsept: string; har: number; skal: number }[] {
  const videos = new Map<string, string>();
  for (const r of rader.filter((x) => sammeUke(x, uke))) videos.set(r.videoId, grunnKonsept(r.konsept));
  const count = (k: string) => [...videos.values()].filter((v) => v === k).length;
  const extra = [...new Set(videos.values())].filter((k) => !(k in UKEMIKS));
  return [
    ...Object.entries(UKEMIKS).map(([konsept, skal]) => ({ konsept, har: count(konsept), skal })),
    ...extra.map((konsept) => ({ konsept, har: count(konsept), skal: 0 })),
  ];
}

/** «Uke 45 mangler 1 Sitcom», «Uke 46 har 4 Folka Først». Varsler bare, blokkerer aldri. */
export function miksAvvik(uke: Uke, rader: PlanRad[]): string[] {
  return miks(uke, rader)
    .filter((m) => m.har !== m.skal)
    .map((m) => (m.har < m.skal ? `Uke ${uke.uke} mangler ${m.skal - m.har} ${m.konsept}` : `Uke ${uke.uke} har ${m.har} ${m.konsept}`));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Manuell flytting: bare til en dag i samme uke og et gyldig klokkeslett. Gir feilmelding eller null. */
export function kanFlytte(rad: Pick<PlanRad, "aar" | "uke">, dato: string, klokkeslett: string): string | null {
  if (!HHMM.test(klokkeslett)) return "Klokkeslett må være på formen TT:MM.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato) || !sammeUke(isoUke(dato), rad)) return "Datoen må være i samme uke.";
  return null;
}

export const gyldigStatus = (s: string): s is Status => (STATUSER as readonly string[]).includes(s);

const ukedagFor = (dato: string) => UKEDAGER_LANG[(new Date(`${dato}T00:00:00Z`).getUTCDay() + 6) % 7];

/** CSV for planen: én rad per plattform. Ikke plasserte rader står uten dato. */
export function planCsv(rader: PlanRad[]): string {
  const label = (k: string) => PLAN_PLATTFORMER.find((p) => p.key === k)?.label ?? k;
  const sorted = rader
    .slice()
    .sort((a, b) => (a.dato ?? "9999").localeCompare(b.dato ?? "9999") || (a.klokkeslett ?? "").localeCompare(b.klokkeslett ?? ""));
  const rows = [
    ["Dato", "Ukedag", "Klokkeslett (Oslo)", "Plattform", "Tittel", "Type innhold", "Merking", "Grunnlag", "Status"],
    ...sorted.map((r) => [
      r.dato ?? "",
      r.dato ? ukedagFor(r.dato) : "ikke plassert",
      r.klokkeslett ?? "",
      label(r.plattform),
      r.tittel,
      r.konsept,
      r.flyttetManuelt ? `${r.merking ?? ""} (flyttet manuelt)`.trim() : (r.merking ?? ""),
      r.grunnlag,
      r.status,
    ]),
  ];
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

/** Tittel fra et filnavn: «folka_forst-episode-14.mp4» → «folka forst episode 14». Filen leses aldri. */
export function tittelFraFilnavn(navn: string): string {
  return navn
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/** Leser en rad fra dashboard.planned_posts. Ukjente eller ufullstendige rader gir null. */
export function fraView(r: Record<string, unknown>): PlanRad | null {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
  const id = s("id");
  const videoId = s("video_id");
  const tittel = s("tittel");
  const konsept = s("konsept");
  const plattform = s("plattform");
  const aar = n("aar");
  const uke = n("uke");
  const status = s("status");
  if (!id || !videoId || !tittel || !konsept || !plattform || aar == null || uke == null || !status || !gyldigStatus(status)) return null;
  const merking = s("merking");
  return {
    id,
    videoId,
    aar,
    uke,
    tittel,
    konsept,
    plattform,
    dato: s("planlagt_dato"),
    klokkeslett: s("klokkeslett")?.slice(0, 5) ?? null,
    merking: merking === "Basert på data" || merking === "Test" ? merking : null,
    grunnlag: s("grunnlag") ?? "",
    status,
    flyttetManuelt: r.flyttet_manuelt === true,
  };
}

/** «tirsdag 20.10 kl. 19:00», eller «ikke plassert». */
export const naar = (r: Pick<PlanRad, "dato" | "klokkeslett">) => (r.dato ? `${ukedagFor(r.dato)} ${formatDayMonth(r.dato)} kl. ${r.klokkeslett}` : "ikke plassert");
