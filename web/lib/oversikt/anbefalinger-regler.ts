// Terskler og lister for anbefalingslinjen, samlet ett sted. Endres her, ikke i logikken.

/** Konsepter som aldri gir anbefalinger: samlekategorier og Veksthusets egne informasjonsinnlegg. */
export const EXCLUDED_CONCEPTS: readonly string[] = ["Før konsepter", "Ukjent", "Annet/aktualitet", "Bankinfo"];

/** A: et innlegg som er 7–14 dager gammelt, med minst 1,5 × konseptets median visninger. */
export const A_MIN_AGE_DAYS = 7;
export const A_MAX_AGE_DAYS = 14;
export const A_MIN_RATIO = 1.5;

/** B/B2: lederen må ligge minst 10 % over nummer to, og det må finnes minst 2 godkjente konsepter. */
export const B_MIN_LEAD = 0.1;
export const B_MIN_CONCEPTS = 2;

/** C: de 3 siste modne innleggene ligger alle under ⅔ av konseptets median. */
export const C_POSTS = 3;
export const C_FACTOR = 2 / 3;

/** Rekkefølgen reglene prøves i innenfor én plattform og ett format; bare den første som treffer vises. */
export const PRIORITY = ["C", "A", "B", "B2"] as const;

/** Høyst så mange anbefalinger på siden (én per plattform og format). «Lovende» teller ikke med. */
export const MAX_RECOMMENDATIONS = 3;

/** Konsepter med så mange dager eller mer siden siste innlegg merkes med datoen (blir snart inaktive ved 21). */
export const SOON_INACTIVE_DAYS = 14;
