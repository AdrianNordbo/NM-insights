// Visningsmodell for tips-siden (/trender). Alle tall og tekster lages her; komponenten viser bare.

import type { Format, Platform } from "../data/types";
import { formatDayMonth } from "../format";
import { FORMAT_NAME, FORMAT_ORDER, PLATFORM_NAME, PLATFORM_ORDER } from "../navn";
import {
  analyse,
  ANALYSE_FORMATS,
  BRUK_MIN_CONCEPTS,
  BRUK_MIN_POSTS,
  BRUK_MIN_RATIO,
  type FactorKey,
  FACTOR_NAME,
  type FeatureRow,
  type Finding,
  rate,
  RETNING_MIN_POSTS,
  RETNING_MIN_RATIO,
  tidsromSjekk,
} from "./analyse";

const ratioFmt = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 1.309 → «×1,31» */
export const ratio = (v: number) => `×${ratioFmt.format(v)}`;

/** «Folka Først og Sitcom», «A, B og C». */
export function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type TipConcept = {
  name: string;
  ratio: string;
  posts: number;
  preliminary: boolean;
  /** «17–30 s» / «40–85 tegn» for tredeler; ellers null. */
  range: string | null;
  tidstrend: boolean;
};

export type TidsromBand = { band: string; posts: number; period: string; ratio: string; current: boolean };
export type TidsromKonsept = { concept: string; preliminary: boolean; bands: TidsromBand[] };

export type TipItem = {
  id: string;
  status: "bruk" | "test";
  factor: FactorKey;
  factorName: string;
  title: string;
  /** Hovedtallet: for «bruk» grunnlaget (solide konsepter uten tidstrend), for «test» alle innlegg i gruppen. */
  ratio: string;
  posts: number;
  conceptCount: number;
  /** «Folka Først og Sitcom» (de som teller som støtte), bare for «bruk». */
  support: string | null;
  /** Alle innlegg i gruppen, når hovedtallet er grunnlaget. */
  allLine: string | null;
  hypothesis: string | null;
  /** Hvorfor funnet bare er «test». */
  whyTest: string[];
  concepts: TipConcept[];
  tidstrend: string[];
  tidsrom: TidsromKonsept[] | null;
};

export type TipSection = {
  id: string;
  platform: Platform;
  format: Format;
  name: string;
  /** «84 modne innlegg i 4 konsepter» */
  basis: string;
  baseline: { name: string; posts: number; preliminary: boolean }[];
  bruk: TipItem[];
  test: TipItem[];
};

function title(f: Finding): string {
  if (f.factor === "tidsrom") return `Publisert ${f.level}`;
  if (f.factor === "ukedag") return `${list(f.concepts)} på ${f.level}`;
  return cap(f.level);
}

function hypothesis(f: Finding): string {
  if (f.factor === "tidsrom") return `Innlegg publisert ${f.level} får flere visninger enn vanlig for konseptet.`;
  if (f.factor === "ukedag") return `${list(f.concepts)} får flere visninger på ${f.level} enn på andre dager.`;
  return `${cap(f.level)} (sammenlignet med andre innlegg i samme konsept) gir flere visninger enn vanlig.`;
}

function whyTest(f: Finding): string[] {
  const out: string[] = [];
  const s = f.solid;
  if (s.posts === 0) out.push("ingen konsepter med minst 6 modne innlegg og uten mulig tidstrend");
  else if (s.posts < BRUK_MIN_POSTS) out.push(`bare ${s.posts} innlegg i grunnlaget (krever ${BRUK_MIN_POSTS})`);
  if (s.posts > 0 && s.conceptsUp.length < BRUK_MIN_CONCEPTS)
    out.push(
      `${s.conceptsUp.length === 1 ? "bare ett konsept" : "ingen konsepter"} peker tydelig samme vei (minst ${ratio(RETNING_MIN_RATIO)} og ${RETNING_MIN_POSTS} innlegg)`,
    );
  if (s.conceptsDown.length) out.push(`${list(s.conceptsDown)} peker motsatt vei`);
  if (s.posts > 0 && (s.median ?? 0) < BRUK_MIN_RATIO) out.push(`grunnlaget er ${ratio(s.median ?? 0)} (krever ${ratio(BRUK_MIN_RATIO)})`);
  return out;
}

function rangeText(f: Finding, r?: [number, number]): string | null {
  if (!r) return null;
  const unit = f.factor === "varighet" ? "s" : "tegn";
  const [lo, hi] = r.map((v) => Math.round(v));
  return lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`;
}

function tidsrom(rows: FeatureRow[], f: Finding): TidsromKonsept[] | null {
  if (f.factor !== "tidsrom") return null;
  const sjekk = tidsromSjekk(rows, f.platform, f.format);
  return f.concepts.map((concept) => {
    const own = sjekk.filter((t) => t.concept === concept);
    return {
      concept,
      preliminary: own[0]?.preliminary ?? false,
      bands: own.map((t) => ({
        band: t.band,
        posts: t.posts,
        period: t.first === t.last ? formatDayMonth(t.first) : `${formatDayMonth(t.first)}–${formatDayMonth(t.last)}`,
        ratio: ratio(t.median),
        current: t.band === f.level,
      })),
    };
  });
}

function item(rows: FeatureRow[], f: Finding): TipItem {
  const bruk = f.status === "bruk";
  return {
    id: `${f.platform}-${f.format}-${f.factor}-${f.level}`.replace(/[^a-z0-9æøå-]+/gi, "-").toLowerCase(),
    status: f.status as "bruk" | "test",
    factor: f.factor,
    factorName: FACTOR_NAME[f.factor],
    title: title(f),
    ratio: ratio(bruk ? (f.solid.median as number) : f.median),
    posts: bruk ? f.solid.posts : f.posts,
    conceptCount: bruk ? f.solid.conceptsUp.length : f.conceptCount,
    support: bruk ? list(f.solid.conceptsUp) : null,
    allLine: bruk ? `Alle innlegg i gruppen: ${ratio(f.median)} på ${f.posts} innlegg i ${f.conceptCount} konsepter` : null,
    hypothesis: bruk ? null : hypothesis(f),
    whyTest: bruk ? [] : whyTest(f),
    concepts: f.perConcept.map((c) => ({
      name: c.concept,
      ratio: ratio(c.median),
      posts: c.posts,
      preliminary: c.preliminary,
      range: rangeText(f, c.range),
      tidstrend: f.tidstrend.includes(c.concept),
    })),
    tidstrend: f.tidstrend,
    tidsrom: tidsrom(rows, f),
  };
}

/** Én seksjon per plattform + format som analyseres, i fast rekkefølge. Bare «bruk» og «test» vises. */
export function buildTips(rows: FeatureRow[]): TipSection[] {
  const rated = rate(rows);
  const findings = analyse(rows);
  const out: TipSection[] = [];
  for (const platform of PLATFORM_ORDER) {
    for (const format of FORMAT_ORDER.filter((x) => ANALYSE_FORMATS[platform].includes(x))) {
      const own = rated.filter((r) => r.platform === platform && r.format === format);
      if (!own.length) continue;
      const counts = new Map<string, { posts: number; preliminary: boolean }>();
      for (const r of own) counts.set(r.concept as string, { posts: (counts.get(r.concept as string)?.posts ?? 0) + 1, preliminary: r.preliminaryConcept });
      const baseline = [...counts]
        .map(([name, c]) => ({ name, ...c }))
        .sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name, "nb"));
      const fs = findings.filter((f) => f.platform === platform && f.format === format && f.status);
      out.push({
        id: `${platform}-${format}`.toLowerCase(),
        platform,
        format,
        name: `${PLATFORM_NAME[platform]} · ${FORMAT_NAME[format]}`,
        basis: `${own.length} modne innlegg i ${baseline.length} konsepter`,
        baseline,
        bruk: fs.filter((f) => f.status === "bruk").map((f) => item(rows, f)),
        test: fs.filter((f) => f.status === "test").map((f) => item(rows, f)),
      });
    }
  }
  return out;
}
