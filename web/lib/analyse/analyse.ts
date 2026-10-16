// Regelbasert analyse av hva som har fungert (fase 1). Kilde: dashboard.post_features.
//
// Mål: innleggets visninger / median for konseptet på samme plattform og format. Konseptet holdes dermed
// konstant, så tidspunkt, lengde o.l. ikke får æren for konseptet. Bare modne innlegg (minst 7 dager),
// uten spesiell hendelse (special_event, f.eks. VM 2026) og ikke i ANALYSE_UTELATT. Median, aldri snitt.
// Aldri sammenligning på tvers av plattformer eller formater: alt grupperes per plattform + format.
//
// Status per faktornivå:
//   «bruk»: minst BRUK_MIN_POSTS innlegg, median minst BRUK_MIN_RATIO, og samme retning (median over 1, med minst
//           RETNING_MIN_POSTS innlegg) i minst BRUK_MIN_CONCEPTS konsepter. Bare innlegg fra konsepter med minst FORELOPIG_GRENSE modne innlegg teller.
//   «test»: ellers lovende (median minst BRUK_MIN_RATIO og minst TEST_MIN_POSTS innlegg), også fra foreløpige
//           konsepter (f.eks. På Gata), som derfor aldri kan gi «bruk».
// Dette er mønstre i egne tall, ikke bevis.

import type { Platform } from "../data/types";

export type FeatureRow = {
  platform: Platform;
  account_id: number;
  content_id: string;
  format: string;
  concept: string | null;
  special_event: string | null;
  /** Lokal Oslo-tid uten tidssone. */
  published_at: string;
  /** 1 = mandag … 7 = søndag (Oslo). */
  weekday: number;
  /** 0–23 (Oslo). */
  hour: number;
  hashtag_count: number;
  hashtags: string[] | null;
  text_length: number;
  duration_s: number | null;
  /** «TikTok-versjonen» / «YouTube-versjonen» for Instagram Reels, «egen» for YouTube og TikTok. */
  duration_source: string | null;
  views: number | null;
  is_mature: boolean;
};

/** Konsepter som aldri er med i analysen (ikke innholdskonsepter, eller ikke konsept i det hele tatt). */
export const ANALYSE_UTELATT = ["Bankinfo", "Før konsepter", "Ukjent", "Annet/aktualitet"];

/** Formatene som analyseres per plattform (Instagram bare Reels). */
export const ANALYSE_FORMATS: Record<Platform, string[]> = { instagram: ["REELS"], youtube: ["SHORTS"], tiktok: ["VIDEO"] };

/** Ukedag analyseres bare der konseptet faktisk publiseres på flere ukedager. */
export const UKEDAG_KONSEPTER = ["Folka Først"];

export const FORELOPIG_GRENSE = 6;
export const BRUK_MIN_POSTS = 6;
export const BRUK_MIN_RATIO = 1.15;
export const BRUK_MIN_CONCEPTS = 2;
export const TEST_MIN_POSTS = 3;
/** Et konsept teller som «samme retning» bare med minst så mange innlegg i nivået (ett innlegg er tilfeldig). */
export const RETNING_MIN_POSTS = 2;

export type FactorKey = "tidsrom" | "ukedag" | "tekstlengde" | "varighet" | "hashtags";
export const FACTOR_NAME: Record<FactorKey, string> = {
  tidsrom: "Tidsrom",
  ukedag: "Ukedag",
  tekstlengde: "Tekstlengde",
  varighet: "Varighet",
  hashtags: "Antall hashtags",
};

const WEEKDAY = ["", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = (v.length - 1) / 2;
  return (v[Math.floor(mid)] + v[Math.ceil(mid)]) / 2;
}

const groupKey = (r: { platform: string; format: string; concept: string | null }) => `${r.platform}|${r.format}|${r.concept}`;

/** Innleggene som kan være med: modne, uten spesiell hendelse, kjent format, konsept som ikke er utelatt. */
export function eligible(rows: FeatureRow[]): FeatureRow[] {
  return rows.filter(
    (r) =>
      r.is_mature &&
      r.special_event == null &&
      r.concept != null &&
      !ANALYSE_UTELATT.includes(r.concept) &&
      (ANALYSE_FORMATS[r.platform] ?? []).includes(r.format) &&
      r.views != null,
  );
}

export type ConceptBaseline = { median: number; posts: number; preliminary: boolean };

/** Median visninger per plattform + format + konsept (grunnlinjen). */
export function conceptBaselines(rows: FeatureRow[]): Map<string, ConceptBaseline> {
  const groups = new Map<string, number[]>();
  for (const r of rows) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r.views as number]);
  const out = new Map<string, ConceptBaseline>();
  for (const [k, v] of groups) out.set(k, { median: median(v) as number, posts: v.length, preliminary: v.length < FORELOPIG_GRENSE });
  return out;
}

export type RatedRow = FeatureRow & { ratio: number; preliminaryConcept: boolean };

/** Innleggets visninger / konseptets median. Konsepter med median 0 utelates. */
export function rate(rows: FeatureRow[]): RatedRow[] {
  const ok = eligible(rows);
  const base = conceptBaselines(ok);
  return ok.flatMap((r) => {
    const b = base.get(groupKey(r));
    if (!b || b.median <= 0) return [];
    return [{ ...r, ratio: (r.views as number) / b.median, preliminaryConcept: b.preliminary }];
  });
}

/** Tredeler innenfor hvert konsept: «kort» / «middels» / «lang» (null når verdien mangler). */
function tertileWithinConcept(rows: RatedRow[], value: (r: RatedRow) => number | null, names: [string, string, string]) {
  const byConcept = new Map<string, number[]>();
  for (const r of rows) {
    const v = value(r);
    if (v != null) byConcept.set(groupKey(r), [...(byConcept.get(groupKey(r)) ?? []), v]);
  }
  return (r: RatedRow): string | null => {
    const v = value(r);
    const all = byConcept.get(groupKey(r));
    if (v == null || !all || all.length < 3) return null;
    const sorted = [...all].sort((a, b) => a - b);
    const lowCut = sorted[Math.floor(sorted.length / 3)];
    const highCut = sorted[Math.floor((2 * sorted.length) / 3)];
    return v < lowCut ? names[0] : v < highCut ? names[1] : names[2];
  };
}

export function hourBand(hour: number): string {
  if (hour < 17) return "før kl. 17";
  if (hour < 19) return "kl. 17–19";
  if (hour < 21) return "kl. 19–21";
  return "kl. 21 eller senere";
}

export function hashtagBand(n: number): string {
  return n < 5 ? "under 5 hashtags" : n === 5 ? "5 hashtags" : "over 5 hashtags";
}

/** Faktornivå per innlegg; null = innlegget er ikke med for denne faktoren. */
function levelFns(rows: RatedRow[]): Record<FactorKey, (r: RatedRow) => string | null> {
  return {
    tidsrom: (r) => hourBand(r.hour),
    ukedag: (r) => (r.concept && UKEDAG_KONSEPTER.includes(r.concept) ? WEEKDAY[r.weekday] : null),
    tekstlengde: tertileWithinConcept(rows, (r) => r.text_length, ["kort tekst", "middels tekst", "lang tekst"]),
    varighet: tertileWithinConcept(rows, (r) => (r.duration_s == null ? null : Number(r.duration_s)), ["kort video", "middels video", "lang video"]),
    hashtags: (r) => hashtagBand(r.hashtag_count),
  };
}

export type Finding = {
  platform: Platform;
  format: string;
  factor: FactorKey;
  level: string;
  status: "bruk" | "test" | null;
  /** Median av forholdstallet (visninger / konseptets median) for alle innlegg i nivået. */
  median: number;
  posts: number;
  /** Konsepter med innlegg i nivået, og hvilke som peker samme vei (median over 1, minst RETNING_MIN_POSTS innlegg). */
  concepts: string[];
  conceptsUp: string[];
  /** Tall bare fra konsepter med minst 6 modne innlegg (grunnlaget for «bruk»). */
  solid: { median: number | null; posts: number; conceptsUp: string[] };
  /** Per konsept: median og antall i nivået. */
  perConcept: { concept: string; median: number; posts: number; preliminary: boolean }[];
};

function stats(rs: RatedRow[]) {
  const byConcept = new Map<string, RatedRow[]>();
  for (const r of rs) byConcept.set(r.concept as string, [...(byConcept.get(r.concept as string) ?? []), r]);
  const perConcept = [...byConcept].map(([concept, list]) => ({
    concept,
    median: median(list.map((x) => x.ratio)) as number,
    posts: list.length,
    preliminary: list[0].preliminaryConcept,
  }));
  return {
    median: median(rs.map((r) => r.ratio)),
    posts: rs.length,
    perConcept: perConcept.sort((a, b) => b.posts - a.posts),
    conceptsUp: perConcept.filter((c) => c.median > 1 && c.posts >= RETNING_MIN_POSTS).map((c) => c.concept),
  };
}

/** Alle faktornivåer per plattform + format, med status. Sortert: bruk, test, resten; så høyest median. */
export function analyse(rows: FeatureRow[]): Finding[] {
  const rated = rate(rows);
  const out: Finding[] = [];
  const groups = new Map<string, RatedRow[]>();
  for (const r of rated) groups.set(`${r.platform}|${r.format}`, [...(groups.get(`${r.platform}|${r.format}`) ?? []), r]);
  for (const [key, list] of groups) {
    const [platform, format] = key.split("|") as [Platform, string];
    const fns = levelFns(list);
    for (const factor of Object.keys(fns) as FactorKey[]) {
      const byLevel = new Map<string, RatedRow[]>();
      for (const r of list) {
        const level = fns[factor](r);
        if (level != null) byLevel.set(level, [...(byLevel.get(level) ?? []), r]);
      }
      for (const [level, rs] of byLevel) {
        const all = stats(rs);
        const solidRows = rs.filter((r) => !r.preliminaryConcept);
        const solid = stats(solidRows);
        const bruk =
          solid.posts >= BRUK_MIN_POSTS &&
          (solid.median ?? 0) >= BRUK_MIN_RATIO &&
          solid.conceptsUp.length >= BRUK_MIN_CONCEPTS;
        const test = !bruk && all.posts >= TEST_MIN_POSTS && (all.median ?? 0) >= BRUK_MIN_RATIO;
        out.push({
          platform,
          format,
          factor,
          level,
          status: bruk ? "bruk" : test ? "test" : null,
          median: all.median as number,
          posts: all.posts,
          concepts: all.perConcept.map((c) => c.concept),
          conceptsUp: all.conceptsUp,
          solid: { median: solid.median, posts: solid.posts, conceptsUp: solid.conceptsUp },
          perConcept: all.perConcept,
        });
      }
    }
  }
  const rank = (f: Finding) => (f.status === "bruk" ? 0 : f.status === "test" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.median - a.median);
}
