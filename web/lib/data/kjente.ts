// Dashboardet viser bare plattformer og formater det kjenner. Rader med andre verdier (f.eks. en ny
// plattform som er lagt inn i viewene før koden kjenner den) ignoreres, så siden aldri krasjer eller viser
// rader uten navn, uansett om en migrering kjøres før eller etter at koden er i produksjon.

import { KNOWN_FORMATS } from "../navn";
import type { Format, Platform } from "./types";

export function isKnownPlatform(platform: unknown): platform is Platform {
  return typeof platform === "string" && Object.prototype.hasOwnProperty.call(KNOWN_FORMATS, platform);
}

export function isKnown(row: { platform: unknown; format: unknown }): boolean {
  return isKnownPlatform(row.platform) && KNOWN_FORMATS[row.platform].includes(row.format as Format);
}

/** Rader med innleggsformat (content_latest, concept_summary, platform_summary). */
export const onlyKnown = <T extends { platform: unknown; format: unknown }>(rows: T[]): T[] => rows.filter(isKnown);

/** daily_activity: formatene der er kontoformater (ALL, STORY …); bare plattformen sjekkes. */
export const onlyKnownPlatforms = <T extends { platform: unknown }>(rows: T[]): T[] =>
  rows.filter((r) => isKnownPlatform(r.platform));
