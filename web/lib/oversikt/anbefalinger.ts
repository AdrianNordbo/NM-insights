// Anbefalingslinjen øverst på Oversikt. Regelbasert, én anbefaling per plattform og format,
// og aldri sammenligning på tvers av plattformer eller formater. Gjelder nå, ikke valgt periode.
// Tersklene ligger i anbefalinger-regler.ts.

import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";
import { formatDayMonth, formatNumber, formatPercent, formatRatio } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME } from "../navn";
import { formatVisible } from "./adresse";
import {
  A_MAX_AGE_DAYS,
  A_MIN_AGE_DAYS,
  A_MIN_RATIO,
  B_MIN_CONCEPTS,
  B_MIN_LEAD,
  C_FACTOR,
  C_POSTS,
  EXCLUDED_CONCEPTS,
  MAX_RECOMMENDATIONS,
  PRIORITY,
  SOON_INACTIVE_DAYS,
} from "./anbefalinger-regler";
import { daysSince, INACTIVE_AFTER_DAYS, isActive, lastPublished, maturePosts } from "./konsepter";

export type RuleKind = (typeof PRIORITY)[number];

export type Recommendation = {
  kind: RuleKind;
  text: string;
  /** Tallene anbefalingen bygger på (info-ikonet). */
  details: string;
};

export type Promising = { text: string; details: string };

export type RecommendationBlock = {
  id: string;
  platform: Platform;
  format: Format;
  name: string;
  recommendation: Recommendation | null;
  promising: Promising | null;
};

export type RecommendationLine = {
  blocks: RecommendationBlock[];
  /** Ingen regel traff i noen blokk. */
  empty: boolean;
};

type Candidate = {
  concept: string;
  label: string;
  posts: number;
  median: number;
  engagement: number | null;
  mature: ContentLatestRow[];
};

const SCOPE = (name: string) =>
  `Bare innlegg som er minst 7 dager gamle, bare konsepter med innlegg de siste ${INACTIVE_AFTER_DAYS} dagene og minst 6 slike innlegg. ` +
  `Sammenligner bare ${name} med ${name}. Gjelder nå, uavhengig av valgt periode.`;

const firstLine = (title: string | null) => title?.split("\n")[0].trim() || "(uten tittel)";

/** «Uten kompetanse (siste innlegg 17.09)» når konseptet snart blir inaktivt, ellers bare navnet. */
export function conceptLabel(concept: string, last: string | null, today: string): string {
  return last && daysSince(last, today) >= SOON_INACTIVE_DAYS ? `${concept} (siste innlegg ${formatDayMonth(last)})` : concept;
}

/** Leder på et mål, men bare når den ligger minst B_MIN_LEAD over nummer to. */
function clearLeader(cands: Candidate[], value: (c: Candidate) => number | null): Candidate | null {
  const sorted = cands.filter((c) => value(c) != null).sort((a, b) => value(b)! - value(a)!);
  if (sorted.length < B_MIN_CONCEPTS) return null;
  const [first, second] = sorted;
  const a = value(first)!;
  const b = value(second)!;
  // Liten toleranse, så nøyaktig 10 % foran (f.eks. 715 mot 650) ikke faller bort på flyttallsavrunding.
  return b > 0 ? ((a - b) / b >= B_MIN_LEAD - 1e-9 ? first : null) : a > 0 ? first : null;
}

function ruleC(cands: Candidate[], name: string): Recommendation | null {
  const hits = cands
    .map((c) => ({ c, last: c.mature.slice(-C_POSTS) }))
    .filter(({ c, last }) => last.length === C_POSTS && last.every((p) => (p.views ?? 0) < c.median * C_FACTOR));
  if (!hits.length) return null;
  const score = ({ c, last }: (typeof hits)[number]) => last.reduce((s, p) => s + (p.views ?? 0), 0) / (C_POSTS * c.median);
  const { c, last } = hits.sort((x, y) => score(x) - score(y))[0];
  return {
    kind: "C",
    text: `De tre siste ${c.label}-innleggene lå under ⅔ av vanlig.`,
    details:
      `${c.concept}: de tre siste modne innleggene fikk ${last.map((p) => formatNumber(p.views)).join(", ")} visninger. ` +
      `Grensen er ⅔ av konseptets median (${formatNumber(c.median)} × ⅔ = ${formatNumber(c.median * C_FACTOR)}), ` +
      `median av ${c.posts} innlegg. ${SCOPE(name)}`,
  };
}

function ruleA(cands: Candidate[], content: ContentLatestRow[], platform: Platform, format: Format, name: string): Recommendation | null {
  const hits = content
    .filter((p) => p.platform === platform && p.format === format && !p.special_event)
    // Alder i hele dager, som i «Ferske innlegg» (14,3 dager = 14 dager gammel).
    .filter((p) => Math.floor(p.age_days) >= A_MIN_AGE_DAYS && Math.floor(p.age_days) <= A_MAX_AGE_DAYS)
    .flatMap((p) => {
      const c = cands.find((x) => x.concept === p.concept);
      if (!c || p.views == null || c.median <= 0) return [];
      const ratio = p.views / c.median;
      return ratio >= A_MIN_RATIO ? [{ p, c, ratio }] : [];
    })
    .sort((a, b) => b.ratio - a.ratio);
  if (!hits.length) return null;
  const { p, c, ratio } = hits[0];
  return {
    kind: "A",
    text: `«${firstLine(p.title)}» (${formatDayMonth(p.published_at)}) fikk ${formatRatio(ratio)} av vanlig for ${c.label}.`,
    details:
      `${formatNumber(p.views)} visninger mot median ${formatNumber(c.median)} for ${c.concept} (${c.posts} innlegg), ` +
      `altså ${formatRatio(ratio)}. Regel: innlegg som er ${A_MIN_AGE_DAYS}–${A_MAX_AGE_DAYS} dager gamle med minst ` +
      `${formatRatio(A_MIN_RATIO)} av konseptets median. ${SCOPE(name)}`,
  };
}

function ruleB(cands: Candidate[], name: string): Recommendation | null {
  const views = clearLeader(cands, (c) => c.median);
  const engagement = clearLeader(cands, (c) => c.engagement);
  if (!views || !engagement) return null;
  const numbers =
    cands
      .map((c) => `${c.concept}: median ${formatNumber(c.median)} visninger, ${formatPercent(c.engagement)} engasjement per visning (${c.posts} innlegg)`)
      .join(". ") + ".";
  const rule = `Lederen må ligge minst ${Math.round(B_MIN_LEAD * 100)} % over nummer to. Engasjement per visning = (likes + kommentarer) / visninger, median.`;
  if (views.concept === engagement.concept) {
    return {
      kind: "B",
      text: `${views.label} leder både på visninger og engasjement.`,
      details: `${numbers} ${rule} ${SCOPE(name)}`,
    };
  }
  return {
    kind: "B2",
    text: `${views.label} når flest, ${engagement.label} engasjerer best.`,
    details: `${numbers} ${rule} ${SCOPE(name)}`,
  };
}

function promisingFor(
  rows: ConceptSummaryRow[],
  content: ContentLatestRow[],
  cands: Candidate[],
  platform: Platform,
  format: Format,
  today: string,
  name: string,
): Promising | null {
  const fresh = rows
    .filter((c) => c.preliminary && c.concept && !EXCLUDED_CONCEPTS.includes(c.concept) && c.median_views != null)
    .filter((c) => {
      const last = lastPublished(content, platform, format, c.concept);
      return last != null && isActive(last, today);
    })
    .sort((a, b) => (b.median_views ?? 0) - (a.median_views ?? 0));
  if (!fresh.length) return null;
  const c = fresh[0];
  const best = Math.max(0, ...cands.map((x) => x.median));
  const promising = cands.length > 0 && (c.median_views ?? 0) >= best;
  return {
    text: `${c.concept}: ${promising ? "lovende, men for tidlig å si" : "nytt konsept, for tidlig å si"} (${c.posts} innlegg).`,
    details:
      `${c.concept} har ${c.posts} modne innlegg med median ${formatNumber(c.median_views)} visninger. ` +
      (cands.length
        ? `Beste godkjente konsept i ${name} har median ${formatNumber(best)}. `
        : `Ingen godkjente konsepter å sammenligne med i ${name}. `) +
      `Konseptet rangeres ikke før det har minst 6 innlegg som er minst 7 dager gamle.`,
  };
}

/** Anbefalingene for alle synlige plattformer og formater. */
export function buildRecommendations(
  concepts: ConceptSummaryRow[],
  content: ContentLatestRow[],
  today: string,
  feed: boolean,
): RecommendationLine {
  const combos = [...new Map(concepts.map((c) => [`${c.platform}|${c.format}`, c])).values()]
    .map((c) => ({ platform: c.platform, format: c.format }))
    .filter((c) => formatVisible(c.format, feed))
    .sort((a, b) => a.platform.localeCompare(b.platform) || FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));

  const blocks: RecommendationBlock[] = combos.map(({ platform, format }) => {
    const name = `${PLATFORM_NAME[platform]} ${FORMAT_NAME[format]}`;
    const rows = concepts.filter((c) => c.platform === platform && c.format === format && !c.special_event);
    // Samme kriterier som konsepttabellen: aktiv, ikke foreløpig, ikke spesiell hendelse; i tillegg utelatte konsepter.
    const cands: Candidate[] = rows.flatMap((c) => {
      if (!c.concept || c.preliminary || EXCLUDED_CONCEPTS.includes(c.concept) || c.median_views == null) return [];
      const last = lastPublished(content, platform, format, c.concept);
      if (!last || !isActive(last, today)) return [];
      return [{
        concept: c.concept,
        label: conceptLabel(c.concept, last, today),
        posts: c.posts,
        median: c.median_views,
        engagement: c.median_engagement_per_view,
        mature: maturePosts(content, platform, format, c.concept),
      }];
    });

    const rules: Record<RuleKind, () => Recommendation | null> = {
      C: () => ruleC(cands, name),
      A: () => ruleA(cands, content, platform, format, name),
      B: () => ruleB(cands, name),
      B2: () => null, // B og B2 avgjøres i samme regel (samme eller ulike ledere)
    };
    let recommendation: Recommendation | null = null;
    for (const kind of PRIORITY) {
      recommendation = rules[kind]();
      if (recommendation) break;
    }
    return {
      id: `${platform}-${format}`,
      platform,
      format,
      name: `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`,
      recommendation,
      promising: promisingFor(rows, content, cands, platform, format, today, name),
    };
  });

  // Høyst MAX_RECOMMENDATIONS anbefalinger. Blokker uten treff vises med «Ingen tydelige signaler».
  let left = MAX_RECOMMENDATIONS;
  const shown = blocks.map((b) => {
    if (!b.recommendation) return b;
    if (left > 0) {
      left--;
      return b;
    }
    return { ...b, recommendation: null };
  });
  return { blocks: shown, empty: !shown.some((b) => b.recommendation) };
}
