// Regler for den delte publiseringskalenderen, samlet ett sted.

/** Typene innhold som kan planlegges (CTF og Uten kompetanse er avsluttet). */
export const PLAN_KONSEPTER = ["Folka Først", "Sitcom", "På Gata"] as const;

/**
 * Fast ukemiks: antall videoer per type innhold per uke. Kalenderen endrer aldri miks eller frekvens; den
 * viser bare hva som er lagt inn mot miksen og varsler ved avvik (uten å blokkere).
 */
export const UKEMIKS: Readonly<Record<string, number>> = { "Folka Først": 3, Sitcom: 1, "På Gata": 1 };

/** Tester per plattform og uke i utkastet (kan endres i reglene på siden, aldri over MAKS_TESTER_PER_UKE). */
export const TESTER_PER_UKE = 1;

export const STATUSER = ["Utkast", "Klar", "Publisert"] as const;
export type Status = (typeof STATUSER)[number];
