// Caption i den delte kalenderen (2026-10-26_drive_kalender.sql): caption_skjelett er fryst fra Drive-innboksen,
// caption_tekst er redaktørens ferdige tekst (null = skjelettet gjelder). Lagres via planlegging.lagre_caption.
// Klar-sperren speiler sett_status og lagre_caption: teksten, eller skjelettet når teksten er tom, kan ikke ha
// «[SKRIV» (store bokstaver, som LIKE i SQL). Poster uten caption kan settes til Klar som før.

import { FEIL_LAGRE } from "./innboks";
import type { PlanRad } from "./ukeplan";
import { PLAN_PLATTFORMER } from "../regler/plattformer";
import type { Status } from "../regler/plan";

export const MAKS_CAPTION = 2200;
export const YT_TITTEL_MAKS = 100;
const MAKS_TEKST = "2 200"; // vanlig mellomrom (toLocaleString gir hardt mellomrom)
const SKRIV = "[SKRIV";

type Caption = Pick<PlanRad, "captionSkjelett" | "captionTekst">;

const label = (k: string) => PLAN_PLATTFORMER.find((p) => p.key === k)?.label ?? k;
const rekkefolge = (k: string) => PLAN_PLATTFORMER.findIndex((p) => p.key === k);

/** Antall tegn slik databasen teller dem (Unicode-tegn, ikke UTF-16), så en emoji teller som ett. */
export const tegn = (tekst: string) => [...tekst.trim()].length;

export const harSkriv = (tekst: string | null | undefined) => !!tekst && tekst.includes(SKRIV);

/** Teksten som gjelder: ferdig tekst, ellers skjelettet (som coalesce(caption_tekst, caption_skjelett) i SQL). */
export const gjeldende = (r: Caption) => r.captionTekst ?? r.captionSkjelett;

/** Grunnen til at Klar er sperret, eller null. */
export function klarSperre(r: Caption): string | null {
  return harSkriv(gjeldende(r)) ? "Klar er sperret: captionen har fortsatt [SKRIV …]. Skriv ferdig captionen under." : null;
}

/** Alle [SKRIV …] som står igjen, i rekkefølge og uten dubletter. */
export function gjenstaar(tekst: string | null | undefined): string[] {
  return [...new Set(tekst?.match(/\[SKRIV[^\]\n]*\]?/g) ?? [])];
}

/** Det feltet fylles med: ferdig tekst, ellers skjelettet, ellers tomt. */
export const startTekst = (r: Caption) => r.captionTekst ?? r.captionSkjelett ?? "";

/** Teksten som sendes til lagre_caption: trimmet, og tom når den er lik skjelettet (da gjelder skjelettet). */
export function tilLagring(felt: string, skjelett: string | null): string {
  const t = felt.trim();
  return skjelett != null && t === skjelett.trim() ? "" : t;
}

/** Om feltet avviker fra det som er lagret. */
export const endret = (felt: string, r: Caption) => tilLagring(felt, r.captionSkjelett) !== (r.captionTekst?.trim() ?? "");

/** Etiketten over feltet. */
export function etikett(felt: string, r: Caption): string {
  if (endret(felt, r)) return "Din tekst, ikke lagret";
  if (r.captionTekst) return "Din tekst";
  return r.captionSkjelett ? "Skjelett, ikke endret" : "Ingen caption";
}

/** Status etter lagre_caption: Klar blir Utkast når den lagrede teksten (eller skjelettet) har [SKRIV. */
export function statusEtter(r: Caption & Pick<PlanRad, "status">, lagret: string): Status {
  return r.status === "Klar" && harSkriv(lagret.trim() || r.captionSkjelett) ? "Utkast" : r.status;
}

/** Meldingen etter lagring av én eller flere plattformer. */
export function lagretMelding(lagret: { rad: Caption & Pick<PlanRad, "status" | "plattform">; tekst: string }[]): string {
  const navn = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}` : xs[0]);
  const ut = lagret.filter((l) => statusEtter(l.rad, l.tekst) !== l.rad.status).map((l) => label(l.rad.plattform));
  const base = lagret.length > 1 ? `Lagret på ${navn(lagret.map((l) => label(l.rad.plattform)))}.` : "Lagret.";
  if (!ut.length) return base;
  return `${base} ${navn(ut)} er satt tilbake til Utkast fordi teksten har [SKRIV …].`;
}

/** Feil før lagring (lengde), eller null. */
export function sjekkCaption(tekst: string): string | null {
  return tegn(tekst) > MAKS_CAPTION ? `Teksten er for lang (maks ${MAKS_TEKST} tegn).` : null;
}

/**
 * «Bruk samme tekst på alle plattformene»: hva som lagres på de andre plattformene, og hvilke av dem som har egen
 * tekst som blir overskrevet (da må redaktøren bekrefte).
 */
export function kopierTilAlle(
  kilde: Pick<PlanRad, "id">,
  tekst: string,
  rader: (Caption & Pick<PlanRad, "id" | "plattform">)[],
  felt: Record<string, string>,
): { lagre: { id: string; plattform: string; tekst: string }[]; overskriver: string[] } {
  const andre = rader.filter((r) => r.id !== kilde.id);
  const ny = tekst.trim();
  return {
    lagre: rader.map((r) => ({ id: r.id, plattform: r.plattform, tekst: tilLagring(tekst, r.captionSkjelett) })),
    overskriver: andre
      .filter((r) => {
        const egen = tilLagring(felt[r.id] ?? startTekst(r), r.captionSkjelett);
        return egen !== "" && egen !== ny;
      })
      .map((r) => label(r.plattform)),
  };
}

/** Tittelen YouTube får (første linje), med advarsler som ikke blokkerer. */
export function youtubeTittel(tekst: string): { tittel: string; advarsler: string[] } {
  const tittel = tekst.split(/\r?\n/)[0]?.trim() ?? "";
  const advarsler: string[] = [];
  if (!tittel) advarsler.push("Første linje er tom.");
  const n = [...tittel].length;
  if (n > YT_TITTEL_MAKS) advarsler.push(`Første linje er ${n} tegn; YouTube tillater ${YT_TITTEL_MAKS}.`);
  if (/[<>]/.test(tittel)) advarsler.push("Tittelen kan ikke ha < eller >.");
  return { tittel, advarsler };
}

/**
 * Feil fra lagre_caption eller sett_status til en norsk melding. Våre egne raise exception (P0001) er norske og
 * vises som de er, med noen få gjort tydeligere; kjente databasefeil oversettes; alt annet blir standardmeldingen.
 */
export function feilmeldingPlan(kode: string | undefined, melding: string | undefined, hva: "caption" | "status"): string {
  const m = melding?.trim() ?? "";
  if (kode === "P0001" && m) {
    if (m.includes("redaktør")) return "Bare redaktører kan endre kalenderen.";
    if (m.startsWith("Ikke innlogget")) return "Du er ikke innlogget. Last siden på nytt og logg inn.";
    if (m.startsWith("Fant ikke plasseringen")) return "Fant ikke plasseringen. Last siden på nytt.";
    return m.replace(/\.?$/, ".");
  }
  if (kode === "23514" && hva === "caption") return `Teksten er for lang (maks ${MAKS_TEKST} tegn).`;
  if (kode === "42883" || kode === "PGRST202") return hva === "caption" ? "Caption er ikke satt opp i databasen ennå." : FEIL_LAGRE;
  return FEIL_LAGRE;
}

export type CaptionVideo = { videoId: string; tittel: string; konsept: string; fraDrive: boolean; rader: PlanRad[] };

/**
 * Captionene i uken, én gruppe per video med plattformene i fast rekkefølge. Redaktører får alle videoer (også
 * manuelle uten skjelett); andre bare videoer med skjelett eller ferdig tekst.
 */
export function captionVideoer(rader: PlanRad[], editor: boolean): CaptionVideo[] {
  const videoer = new Map<string, PlanRad[]>();
  for (const r of rader) videoer.set(r.videoId, [...(videoer.get(r.videoId) ?? []), r]);
  const forste = (rs: PlanRad[]) => rs.map((r) => r.dato ?? "9999").sort()[0];
  return [...videoer.entries()]
    .map(([videoId, rs]) => {
      const sortert = rs.slice().sort((a, b) => rekkefolge(a.plattform) - rekkefolge(b.plattform));
      return { videoId, tittel: sortert[0].tittel, konsept: sortert[0].konsept, fraDrive: rs.some((r) => r.captionSkjelett != null), rader: sortert };
    })
    .map((v) => (editor ? v : { ...v, rader: v.rader.filter((r) => gjeldende(r) != null) }))
    .filter((v) => v.rader.length)
    .sort((a, b) => forste(a.rader).localeCompare(forste(b.rader)) || a.tittel.localeCompare(b.tittel, "nb"));
}
