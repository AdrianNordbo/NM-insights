import type { Format, Platform } from "./data/types";

export const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };
export const FORMAT_NAME: Record<Format, string> = {
  REELS: "Reels",
  FEED: "Feed",
  SHORTS: "Shorts",
  VIDEO: "Video",
  PHOTO: "Foto",
};
export const FOLLOWER_NAME: Record<Platform, string> = { instagram: "Følgere", youtube: "Abonnenter", tiktok: "Følgere" };
export const NEW_FOLLOWER_NAME: Record<Platform, string> = {
  instagram: "Nye følgere",
  youtube: "Nye abonnenter",
  tiktok: "Nye følgere",
};

/** Kunden dashboardet viser (én kunde foreløpig; per bruker når neste kunde kommer). */
export const KUNDE = "Veksthuset";

/** Fast rekkefølge for plattformer: Instagram, YouTube, TikTok. */
export const PLATFORM_ORDER: Platform[] = ["instagram", "youtube", "tiktok"];

/** Fast rekkefølge for formater: Reels, Feed, Shorts, Video, Foto. */
export const FORMAT_ORDER: Format[] = ["REELS", "FEED", "SHORTS", "VIDEO", "PHOTO"];

/** Formatene dashboardet kjenner per plattform. Alt annet i viewene ignoreres (se data/kjente.ts). */
export const KNOWN_FORMATS: Record<Platform, Format[]> = {
  instagram: ["REELS", "FEED"],
  youtube: ["SHORTS"],
  tiktok: ["VIDEO", "PHOTO"],
};

/** Sortering: plattform i fast rekkefølge, så format i fast rekkefølge. */
export function byPlatformFormat(a: { platform: Platform; format: Format }, b: { platform: Platform; format: Format }) {
  return PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format);
}
