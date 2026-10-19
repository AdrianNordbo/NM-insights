// Plattformvalg samlet ett sted: nedtrekket på sidene og plattformene i publiseringsutkastet.
// En ny plattform (f.eks. Facebook) legges til her; kalenderen og nedtrekkene leser listene.

import type { Format, Platform } from "../data/types";

export type PlattformValg = "alle" | "instagram-reels" | "instagram-feed" | "youtube" | "tiktok";

export type PlattformValgDef = {
  key: PlattformValg;
  label: string;
  /** Plattformene valget gjelder (Alle: alle tre). */
  platforms: Platform[];
  /** Innleggsformatene i lister, kort, konsepter og mønstre. «Alle» tar ikke med Instagram Feed. */
  formats: Partial<Record<Platform, Format[]>>;
  /** Formatene i det store totaltallet og grafen. «Alle» tar med Instagram Feed her. */
  totalFormats: Partial<Record<Platform, Format[]>>;
};

export const STANDARD_PLATTFORM: PlattformValg = "alle";

export const PLATTFORM_VALG: readonly PlattformValgDef[] = [
  {
    key: "alle",
    label: "Alle plattformer",
    platforms: ["instagram", "youtube", "tiktok"],
    formats: { instagram: ["REELS"], youtube: ["SHORTS"], tiktok: ["VIDEO", "PHOTO"] },
    totalFormats: { instagram: ["REELS", "FEED"], youtube: ["SHORTS"], tiktok: ["VIDEO", "PHOTO"] },
  },
  { key: "instagram-reels", label: "Instagram Reels", platforms: ["instagram"], formats: { instagram: ["REELS"] }, totalFormats: { instagram: ["REELS"] } },
  { key: "instagram-feed", label: "Instagram Feed", platforms: ["instagram"], formats: { instagram: ["FEED"] }, totalFormats: { instagram: ["FEED"] } },
  { key: "youtube", label: "YouTube", platforms: ["youtube"], formats: { youtube: ["SHORTS"] }, totalFormats: { youtube: ["SHORTS"] } },
  { key: "tiktok", label: "TikTok", platforms: ["tiktok"], formats: { tiktok: ["VIDEO", "PHOTO"] }, totalFormats: { tiktok: ["VIDEO", "PHOTO"] } },
];

export function plattformValg(key: string | string[] | undefined): PlattformValgDef {
  const k = Array.isArray(key) ? key[0] : key;
  return PLATTFORM_VALG.find((p) => p.key === k) ?? (PLATTFORM_VALG.find((p) => p.key === STANDARD_PLATTFORM) as PlattformValgDef);
}

/** Innlegget/raden hører til valget (lister, kort, konsepter, mønstre). */
export const iValg = (v: PlattformValgDef, platform: Platform, format: string) => (v.formats[platform] ?? []).includes(format as Format);

/** Plattformene i publiseringsutkastet. Hver plattform planlegges etter sitt eget format og sine egne tall. */
export type PlanPlattform = { key: string; label: string; platform: Platform; format: Format };

export const PLAN_PLATTFORMER: readonly PlanPlattform[] = [
  { key: "instagram", label: "Instagram", platform: "instagram", format: "REELS" },
  { key: "youtube", label: "YouTube", platform: "youtube", format: "SHORTS" },
  { key: "tiktok", label: "TikTok", platform: "tiktok", format: "VIDEO" },
];
