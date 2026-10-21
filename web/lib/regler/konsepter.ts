// Konseptregler samlet ett sted: hvilke konsepter som holdes utenfor, og kjente brudd i et konsept.

import { addDays, formatDayMonth } from "../format";

/**
 * Ikke innholdskonsepter (Veksthusets egne informasjons- og reklameinnlegg). Utelates fra konsepter,
 * anbefalinger, mønstre, medianer og innleggslister, men er med i totaler og kontotall.
 */
export const UTELATTE_KONSEPTER: readonly string[] = ["Bankinfo"];

/** Samlekategorier uten et innholdskonsept. Brukes ikke i anbefalinger og mønstre. */
export const SAMLEKATEGORIER: readonly string[] = ["Før konsepter", "Ukjent", "Annet/aktualitet"];

/** Alt som aldri gir anbefalinger eller mønstre. */
export const IKKE_ANALYSE: readonly string[] = [...SAMLEKATEGORIER, ...UTELATTE_KONSEPTER];

export type Konseptbrudd = {
  concept: string;
  from: string;
  reason: string;
  /** Hele ISO-uker der konseptet holder fast tidspunkt i publiseringsutkastet (mandag–søndag). */
  laas?: { from: string; to: string };
};

/**
 * Kjente brudd: innlegg før og etter datoen blandes aldri i medianer og mønstre. Innlegg fra datoen får
 * eget konseptnavn («Folka Først (fra 18.10)») og er en foreløpig gruppe til den har nok modne innlegg.
 */
export const KONSEPTBRUDD: readonly Konseptbrudd[] = [
  // Ny teksting fra søndag 18.10.2026. Låsen gjelder uke 43–46 (mandag 19.10–søndag 15.11).
  { concept: "Folka Først", from: "2026-10-18", reason: "ny teksting", laas: { from: "2026-10-19", to: "2026-11-15" } },
];

/** Antall uker etter et brudd der konseptet holder fast tidspunkt i publiseringsutkastet. */
export const LAAS_UKER = 4;

export const isUtelatt = (concept: string | null | undefined) => !!concept && UTELATTE_KONSEPTER.includes(concept);

/** Fjerner Bankinfo o.l. (alt i UTELATTE_KONSEPTER). */
export function utenUtelatte<T extends { concept: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isUtelatt(r.concept));
}

/** «Folka Først (fra 18.10)» */
export const bruddNavn = (b: Konseptbrudd) => `${b.concept} (fra ${formatDayMonth(b.from)})`;

/** Bruddet som gjelder innlegget (konsept + publiseringsdato i Oslo-tid), eller null. */
export function bruddFor(concept: string | null, publishedAt: string, brudd: readonly Konseptbrudd[] = KONSEPTBRUDD): Konseptbrudd | null {
  return brudd.find((b) => b.concept === concept && publishedAt.slice(0, 10) >= b.from) ?? null;
}

/** Gir innlegg fra bruddatoen eget konseptnavn, så de aldri blandes med innleggene før. */
export function delVedBrudd<T extends { concept: string | null; published_at: string }>(rows: T[], brudd: readonly Konseptbrudd[] = KONSEPTBRUDD): T[] {
  return rows.map((r) => {
    const b = bruddFor(r.concept, r.published_at, brudd);
    return b ? { ...r, concept: bruddNavn(b) } : r;
  });
}

/** Perioden der konseptet holder fast tidspunkt: oppgitte uker, ellers fra bruddatoen i LAAS_UKER uker. */
export const laasPeriode = (b: Konseptbrudd) => b.laas ?? { from: b.from, to: addDays(b.from, LAAS_UKER * 7 - 1) };
