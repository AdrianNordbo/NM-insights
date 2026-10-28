// Drive-innboksen (dashboard.drive_innboks, 2026-10-26_drive_kalender.sql): videoer fra Google Drive som er tolket
// av fetch_drive.py og kan legges i den delte kalenderen. Bare redaktører får rader fra viewet, og siden henter det
// bare for redaktører. Plasseringen bruker nøyaktig samme kode som manuell innlegging (plasserIUke), med uken og
// konseptet fra Drive-mappen; lagringen går via planlegging.legg_til_fra_drive, som avviser dubletter.

import type { HeatSection } from "../analyse/heatmap";
import { PLAN_KONSEPTER } from "../regler/plan";
import { PLAN_PLATTFORMER } from "../regler/plattformer";
import { isoUke, sammeUke, type Uke, ukeKey } from "./uke";
import { grunnKonsept, type NyRad, type PlanRad, plasserIUke, type UkeRegler } from "./ukeplan";
import type { KoVideo } from "./utkast";

export type Tolkning = "ok" | "stopp" | "ikke tolket";

export type InnboksRad = {
  driveFileId: string;
  /** Grunnkonseptet fra Drive-mappen («Folka Først», ikke bruddnavnet). */
  konsept: string;
  aar: number;
  uke: number;
  mappe: string;
  filnavn: string;
  tittel: string | null;
  gjest: string | null;
  yrke: string | null;
  tolkning: Tolkning;
  melding: string;
  skjelett: string | null;
  iKalenderen: boolean;
  /** false når fetch_drive.py har bekreftet at filen er borte fra Drive (404 eller papirkurv). Mangler: true. */
  finnesIDrive: boolean;
};

const TOLKNINGER: Tolkning[] = ["ok", "stopp", "ikke tolket"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fil-ID-er i Drive er bokstaver, tall, «-» og «_». */
export const gyldigDriveId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);

/** Én rad fra viewet, eller null når den mangler felt eller har et konsept kalenderen ikke kjenner. */
export function fraInnboks(r: Record<string, unknown>): InnboksRad | null {
  const s = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string) : null);
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
  const konsept = s("konsept");
  const tolkning = s("tolkning") as Tolkning | null;
  const aar = n("aar");
  const uke = n("uke");
  const filnavn = s("filnavn");
  if (!gyldigDriveId(r.drive_file_id) || !konsept || !(PLAN_KONSEPTER as readonly string[]).includes(konsept)) return null;
  if (!tolkning || !TOLKNINGER.includes(tolkning) || aar == null || uke == null || uke < 1 || uke > 53 || !filnavn) return null;
  const tittel = s("tittel");
  const skjelett = s("caption_skjelett");
  if (tolkning === "ok" && (!tittel || !skjelett)) return null;
  return {
    driveFileId: r.drive_file_id,
    konsept,
    aar,
    uke,
    mappe: s("mappe") ?? "",
    filnavn,
    tittel,
    gjest: s("gjest"),
    yrke: s("yrke"),
    tolkning,
    melding: s("melding") ?? "",
    skjelett,
    iKalenderen: r.i_kalenderen === true,
    finnesIDrive: r.finnes_i_drive !== false,
  };
}

const forUke = (a: Uke, b: Uke) => a.aar - b.aar || a.uke - b.uke;

const rekkefolge = (a: InnboksRad, b: InnboksRad) =>
  a.aar - b.aar ||
  a.uke - b.uke ||
  PLAN_KONSEPTER.indexOf(a.konsept as (typeof PLAN_KONSEPTER)[number]) - PLAN_KONSEPTER.indexOf(b.konsept as (typeof PLAN_KONSEPTER)[number]) ||
  (a.tittel ?? a.filnavn).localeCompare(b.tittel ?? b.filnavn, "nb");

/** Uke før inneværende uke (inneværende uke vises fortsatt). */
export const passert = (r: Uke, today: string) => forUke(r, isoUke(today)) < 0;

/**
 * Klare (ok, ikke i kalenderen) og problemer (stopp eller ikke tolket, ikke i kalenderen). Rader som er borte fra
 * Drive er aldri med; med today er heller ikke rader fra passerte uker med.
 */
export function delInnboks(rader: InnboksRad[], today?: string): { klare: InnboksRad[]; problemer: InnboksRad[] } {
  const ute = rader.filter((r) => !r.iKalenderen && r.finnesIDrive && !(today && passert(r, today)));
  return {
    klare: ute.filter((r) => r.tolkning === "ok").sort(rekkefolge),
    problemer: ute.filter((r) => r.tolkning !== "ok").sort(rekkefolge),
  };
}

/** En uke i ukevelgeren: antall klare videoer og antall som ikke kan legges inn. */
export type InnboksUke = Uke & { klare: number; problemer: number };

/** Ukene som har videoer i innboksen (klare eller problemer), sortert på (år, uke), så 2026-W53 kommer før 2027-W01. */
export function innboksUker(rader: InnboksRad[], today: string): InnboksUke[] {
  const { klare, problemer } = delInnboks(rader, today);
  const uker = new Map<string, InnboksUke>();
  const hent = (r: InnboksRad) => {
    const key = ukeKey(r);
    if (!uker.has(key)) uker.set(key, { aar: r.aar, uke: r.uke, klare: 0, problemer: 0 });
    return uker.get(key) as InnboksUke;
  };
  for (const r of klare) hent(r).klare += 1;
  for (const r of problemer) hent(r).problemer += 1;
  return [...uker.values()].sort(forUke);
}

/**
 * Uken som skal vises: den valgte hvis den fortsatt har videoer; ellers neste uke med videoer etter den
 * (eller den nærmeste før, hvis det ikke finnes noen etter); uten valg den første. Null når innboksen er tom.
 */
export function velgUke(uker: InnboksUke[], valgt: Uke | null): Uke | null {
  if (!uker.length) return null;
  const pick = (u: InnboksUke): Uke => ({ aar: u.aar, uke: u.uke });
  if (!valgt) return pick(uker[0]);
  const samme = uker.find((u) => sammeUke(u, valgt));
  if (samme) return pick(samme);
  const etter = uker.find((u) => forUke(u, valgt) > 0);
  return pick(etter ?? uker[uker.length - 1]);
}

/** Videoene i én uke: klare gruppert per konsept (Folka Først, Sitcom, På Gata), og de som ikke kan legges inn. */
export function innboksForUke(
  rader: InnboksRad[],
  uke: Uke,
  today: string,
): { grupper: { konsept: string; rader: InnboksRad[] }[]; problemer: InnboksRad[] } {
  const { klare, problemer } = delInnboks(rader.filter((r) => sammeUke(r, uke)), today);
  return {
    grupper: PLAN_KONSEPTER.map((konsept) => ({ konsept: konsept as string, rader: klare.filter((r) => r.konsept === konsept) })).filter((g) => g.rader.length),
    problemer,
  };
}

/** Rader som ikke vises (og ikke er lagt inn): borte fra Drive, og fra passerte uker. */
export function skjulteIInnboks(rader: InnboksRad[], today: string): { borte: number; passert: number } {
  const ute = rader.filter((r) => !r.iKalenderen);
  return {
    borte: ute.filter((r) => !r.finnesIDrive).length,
    passert: ute.filter((r) => r.finnesIDrive && passert(r, today)).length,
  };
}

/** Video til plasserIUke: tittel og grunnkonsept fra innboksen. */
export function tilVideo(rad: InnboksRad, plattformer: string[], id: string): KoVideo {
  return { id, title: rad.tittel ?? rad.filnavn, concept: rad.konsept, platforms: plattformer };
}

/** Plasseringene for én Drive-video, i uken fra Drive-mappen. Samme regler og kode som manuell innlegging. */
export function plasserFraInnboks(
  rad: InnboksRad,
  plattformer: string[],
  id: string,
  kalender: PlanRad[],
  regler: UkeRegler,
  heat: Record<string, HeatSection | undefined>,
  today: string,
): NyRad[] {
  return plasserIUke(tilVideo(rad, plattformer, id), { aar: rad.aar, uke: rad.uke }, kalender, regler, heat, today);
}

/** Tittel uten «Veksthuset», konsept, Sitcom-ukenummer og filtype, i små bokstaver (for å finne manuelle dubletter). */
export function normTittel(tekst: string): string {
  return tekst
    .normalize("NFC")
    .toLowerCase()
    .replace(/\.(mp4|mov|m4v)$/, "")
    .replace(/\bveksthuset\b|\bfolka først\b|\bpå gata\b|\bsit-?com\b/g, " ")
    .replace(/^\s*\d{1,2}\.\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * En kalenderrad i samme uke og med samme konsept som ser ut som samme video (lagt inn manuelt, uten Drive-kobling).
 * Databasen kan ikke se slike dubletter, så siden ber om «Legg inn likevel».
 */
export function muligDuplikat(rad: InnboksRad, kalender: PlanRad[]): PlanRad | null {
  const navn = new Set([rad.tittel, rad.filnavn].filter((x): x is string => !!x).map(normTittel).filter(Boolean));
  return (
    kalender.find(
      (r) => r.aar === rad.aar && r.uke === rad.uke && grunnKonsept(r.konsept) === rad.konsept && navn.has(normTittel(r.tittel)),
    ) ?? null
  );
}

export const FEIL_LAGRE = "Klarte ikke å lagre. Prøv igjen, eller sjekk at du er redaktør.";

/**
 * Feil fra legg_til_fra_drive til en norsk melding. Våre egne raise exception (P0001) er allerede norske og
 * vises som de er; kjente databasefeil oversettes; alt annet blir en rolig standardmelding.
 */
export function feilmeldingDrive(kode: string | undefined, melding: string | undefined): string {
  if (kode === "P0001" && melding?.trim()) return melding.trim().replace(/\.?$/, ".");
  if (kode === "23505") return "Videoen ligger allerede i kalenderen.";
  if (kode === "23514") return "Plasseringen er ugyldig (dag eller klokkeslett utenfor uken).";
  if (kode === "23503") return "Fant ikke videoen i Drive-innboksen.";
  if (kode === "42883" || kode === "PGRST202") return "Drive-innboksen er ikke satt opp i databasen ennå.";
  return FEIL_LAGRE;
}

/** Formatsjekk før lagring (samme som for manuell innlegging, pluss Drive-ID og én video i én uke). */
export function sjekkDriveRader(driveFileId: unknown, rader: NyRad[]): string | null {
  if (!gyldigDriveId(driveFileId)) return "Ugyldig video fra Drive.";
  if (rader.length < 1 || rader.length > 10) return "Velg minst én plattform.";
  const forste = rader[0];
  const ok = rader.every(
    (r) =>
      UUID.test(r.videoId) &&
      r.videoId === forste.videoId &&
      r.aar === forste.aar &&
      r.uke === forste.uke &&
      r.tittel.trim().length > 0 &&
      r.tittel.length <= 200 &&
      PLAN_PLATTFORMER.some((p) => p.key === r.plattform) &&
      (r.dato === null || sammeUke(isoUke(r.dato), r)),
  );
  if (!ok) return "Ugyldig plassering.";
  if (new Set(rader.map((r) => r.plattform)).size !== rader.length) return "Samme plattform to ganger.";
  return null;
}
