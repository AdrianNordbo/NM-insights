import type { Format, Platform } from "./data/types";

export const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube" };
export const FORMAT_NAME: Record<Format, string> = { REELS: "Reels", FEED: "Feed", SHORTS: "Shorts" };
export const FOLLOWER_NAME: Record<Platform, string> = { instagram: "Følgere", youtube: "Abonnenter" };
export const NEW_FOLLOWER_NAME: Record<Platform, string> = { instagram: "Nye følgere", youtube: "Nye abonnenter" };

/** Kunden dashboardet viser (én kunde foreløpig; per bruker når neste kunde kommer). */
export const KUNDE = "Veksthuset";

/** Fast rekkefølge for formater: Reels, Feed, Shorts. */
export const FORMAT_ORDER: Format[] = ["REELS", "FEED", "SHORTS"];
