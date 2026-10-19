// Oversikt for et plattform- og periodevalg: KPI-er, graf per døgn, én setning per plattform og plattformkort.
//
// - Alle plattformer bruker siste døgn som alle har data for («alle plattformer, t.o.m. dd.mm»); én plattform
//   bruker sitt eget siste døgn («data til og med dd.mm»).
// - Sammenligning alltid mot like mange dager rett før. Dekker ikke alle valgte plattformer både perioden og
//   dagene før, vises ingen sammenligning (merknad i stedet).
// - Total siden start: levetidstall per innlegg fra content_latest (som Total før), Bankinfo med.
// - Engasjement = likes + kommentarer + delinger (lagringer er ikke med). Ingen sammenligning på tvers av
//   plattformer; summer for Alle er merket med info-ikon i visningen.

import type { ContentLatestRow, Platform } from "../data/types";
import { addDays, formatDayMonth } from "../format";
import { PLATFORM_NAME } from "../navn";
import type { PlattformValgDef } from "../regler/plattformer";
import { type Metrics, type Series, sumRange } from "./aktivitet";
import { type Change, change, PERCENT_MIN_PREV } from "./endring";
import { type FollowerSeries, followersNow, netto, nettoView } from "./folgere";
import { joinNo } from "./sammendrag";
import type { TotalModel } from "./total";
import { forrigeOmraade, omraade, type PeriodeDef } from "./valg";

const EMPTY: Metrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
const add = (a: Metrics, b: Metrics): Metrics => ({
  views: a.views + b.views,
  likes: a.likes + b.likes,
  comments: a.comments + b.comments,
  shares: a.shares + b.shares,
  saves: a.saves + b.saves,
});
/** Likes + kommentarer + delinger. */
export const engasjement = (m: Metrics) => m.likes + m.comments + m.shares;

export type FollowerLine = { platform: Platform; name: string; value: string; note: string | null; source: string | null };
export type ChartDay = { date: string; views: number; interactions: number; prevViews: number | null; prevInteractions: number | null };
export type Sentence = { platform: Platform; name: string; text: string };
export type PlatformCard = {
  platform: Platform;
  name: string;
  note: string;
  views: number | null;
  viewsChange: Change | null;
  prevLabel: string | null;
  engagement: number | null;
  rate: number | null;
  posts: number;
  follow: { value: string; note: string | null; source: string | null };
  spark: number[];
};

export type OversiktModell = {
  periodLabel: string;
  lastNote: string;
  coverage: string | null;
  prevLabel: string | null;
  has: boolean;
  isTotal: boolean;
  kpi: {
    views: number | null;
    viewsChange: Change | null;
    engagement: number | null;
    engagementChange: Change | null;
    /** Bare for én plattform. */
    rate: number | null;
    /** Endring i engasjementsrate (andel, ikke prosent): 0.001 = 0,1 prosentpoeng. */
    rateDiff: number | null;
    followersNow: number | null;
    followers: FollowerLine[];
  };
  chart: { days: ChartDay[]; note: string | null };
  sentences: Sentence[];
  cards: PlatformCard[] | null;
};

export type ModellInput = {
  series: Series[];
  /** Alle innlegg (også Bankinfo): totaler. */
  content: ContentLatestRow[];
  /** Innlegg uten utelatte konsepter: innleggstall i kortene. */
  listContent: ContentLatestRow[];
  followers: FollowerSeries[];
  total: TotalModel | null;
  takeover: Partial<Record<Platform, string>>;
  today: string;
};

const dm = formatDayMonth;
const pname = (p: Platform) => PLATFORM_NAME[p];

/** Visningsnavn for plattformen i et valg: «Instagram · Reels», «Instagram · Feed», «YouTube · Shorts», «TikTok». */
function seriesName(p: Platform, formats: string[]): string {
  if (p === "instagram") return formats.includes("FEED") && !formats.includes("REELS") ? "Instagram · Feed" : "Instagram · Reels";
  if (p === "youtube") return "YouTube · Shorts";
  return "TikTok";
}

export function buildOversikt(valg: PlattformValgDef, periode: PeriodeDef, input: ModellInput): OversiktModell | null {
  const { series, content, listContent, followers, total, takeover, today } = input;
  const plats = valg.platforms.filter((p) => series.some((s) => s.platform === p));
  if (!plats.length) return null;
  const alle = valg.key === "alle";

  const seriesFor = (p: Platform, formats: string[]) => series.filter((s) => s.platform === p && formats.includes(s.format));
  const fmts = (p: Platform) => valg.formats[p] ?? [];
  const totFmts = (p: Platform) => valg.totalFormats[p] ?? [];
  const account = (p: Platform) => series.find((s) => s.platform === p) as Series;
  const through = (p: Platform) => account(p).through;
  const firstData = (p: Platform) => account(p).firstData;
  const sum = (p: Platform, formats: string[], a: string, b: string) =>
    seriesFor(p, formats).reduce((m, s) => add(m, sumRange(s, a, b).metrics), { ...EMPTY });
  const day = (p: Platform, formats: string[], d: string) => seriesFor(p, formats).reduce((m, s) => add(m, s.byDay.get(d) ?? EMPTY), { ...EMPTY });
  const start0 = plats.map((p) => takeover[p]).filter((d): d is string => !!d).sort()[0] ?? plats.map(firstData).sort()[0];

  const last = plats.map(through).sort()[0];
  const lastNote = alle ? `alle plattformer, t.o.m. ${dm(last)}` : `data til og med ${dm(last)}`;
  const o = omraade(periode, last, start0);
  const isTotal = periode.kind === "total";
  const prev = isTotal ? null : forrigeOmraade(o);
  const latePrev = prev ? plats.filter((p) => firstData(p) > prev.start) : plats;
  const late = plats.filter((p) => firstData(p) > o.start);
  const canCompare = !!prev && !latePrev.length;
  const coverage = !isTotal && late.length ? late.map((p) => `${pname(p)} har tall fra ${dm(firstData(p))}`).join(", ") : null;

  const cur = o.has ? plats.reduce((m, p) => add(m, sum(p, totFmts(p), o.start, o.end)), { ...EMPTY }) : null;
  const before = canCompare && prev ? plats.reduce((m, p) => add(m, sum(p, totFmts(p), prev.start, prev.end)), { ...EMPTY }) : null;

  // Total: levetidstall per innlegg publisert fra startdatoen, alle konsepter
  const lifetime = (p: Platform, formats: string[]) => {
    const since = takeover[p] ?? start0;
    const rows = content.filter((r) => r.platform === p && formats.includes(r.format) && r.published_at.slice(0, 10) >= since);
    return {
      views: rows.reduce((s, r) => s + (r.views ?? 0), 0),
      eng: rows.reduce((s, r) => s + (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0), 0),
    };
  };
  const tot = isTotal ? plats.map((p) => lifetime(p, totFmts(p))).reduce((a, b) => ({ views: a.views + b.views, eng: a.eng + b.eng })) : null;
  const views = tot ? tot.views : cur ? cur.views : null;
  const eng = tot ? tot.eng : cur ? engasjement(cur) : null;
  const rate = alle || !views || eng == null ? null : eng / views;
  const prevRate = !alle && before && before.views ? engasjement(before) / before.views : null;

  const followerLine = (p: Platform, a: string, b: string, ok: boolean): FollowerLine => {
    const fs = followers.find((f) => f.platform === p);
    if (!fs) return { platform: p, name: pname(p), value: "ikke nok data", note: null, source: null };
    if (isTotal) {
      const t = total?.platforms.find((x) => x.platform === p)?.followers;
      return { platform: p, name: pname(p), value: t?.change ?? "ikke nok data", note: t?.sinceLabel ?? null, source: t?.sourceLabel ?? null };
    }
    if (!ok) return { platform: p, name: pname(p), value: "–", note: null, source: null };
    const v = nettoView(netto(fs, a, b, today));
    return { platform: p, name: pname(p), value: v.value, note: v.note, source: v.sourceLabel };
  };
  const now = plats.map((p) => followers.find((f) => f.platform === p)).filter((f): f is FollowerSeries => !!f);
  // Følgere måles hver dag, uavhengig av døgntallene for visninger: kalenderperioder bruker hele perioden
  // («hittil» når den ikke er ferdig), rullerende perioder samme datoer som visningene.
  const folRange = (own: { start: string; end: string; has: boolean }) =>
    periode.kind === "calendar" ? { start: periode.start, end: periode.end, ok: periode.start <= today } : { start: own.start, end: own.end, ok: own.has };

  // Graf per døgn. Total: fra første døgn alle valgte plattformer har døgntall.
  const chartStart = isTotal ? [o.start, ...plats.map(firstData)].sort().at(-1)! : o.start;
  const chartDays: ChartDay[] = [];
  if (o.has && chartStart <= o.end) {
    for (let d = chartStart, i = 0; d <= o.end; d = addDays(d, 1), i++) {
      const m = plats.reduce((s, p) => add(s, day(p, totFmts(p), d)), { ...EMPTY });
      const pd = prev ? addDays(prev.start, i) : null;
      const pm = canCompare && pd ? plats.reduce((s, p) => add(s, day(p, totFmts(p), pd)), { ...EMPTY }) : null;
      chartDays.push({ date: d, views: m.views, interactions: engasjement(m), prevViews: pm?.views ?? null, prevInteractions: pm ? engasjement(pm) : null });
    }
  }

  // Én setning per plattform (uten Feed for Alle, som listene)
  const sentences: Sentence[] = isTotal
    ? []
    : plats.map((p) => {
        const name = seriesName(p, fmts(p));
        if (!o.has) return { platform: p, name, text: `Ingen data i perioden ennå (${lastNote}).` };
        if (!prev || firstData(p) > prev.start) return { platform: p, name, text: `Ingen sammenligning: tall fra ${dm(firstData(p))}.` };
        return { platform: p, name, text: sentence(sum(p, fmts(p), o.start, o.end), sum(p, fmts(p), prev.start, prev.end), o.days) };
      });

  // Plattformkort (bare for Alle): hver plattform med egen siste dag, Instagram = Reels
  const cards: PlatformCard[] | null = alle
    ? plats.map((p) => {
        const own = through(p);
        const own0 = omraade(periode, own, takeover[p] ?? start0);
        const ownPrev = isTotal ? null : forrigeOmraade(own0);
        const cmp = !!ownPrev && firstData(p) <= ownPrev.start;
        const a = own0.has ? sum(p, fmts(p), own0.start, own0.end) : null;
        const b = cmp && ownPrev ? sum(p, fmts(p), ownPrev.start, ownPrev.end) : null;
        const life = isTotal ? lifetime(p, fmts(p)) : null;
        const v = life ? life.views : a ? a.views : null;
        const e = life ? life.eng : a ? engasjement(a) : null;
        const fr = folRange(own0);
        const fl = followerLine(p, fr.start, fr.end, fr.ok);
        return {
          platform: p,
          name: seriesName(p, fmts(p)),
          note: isTotal ? `siden ${dm(own0.start)}` : `data til og med ${dm(own)}`,
          views: v,
          viewsChange: a && b ? change(a.views, b.views) : null,
          prevLabel: cmp && ownPrev ? ownPrev.label.replace(/ \(.*\)$/, "") : null,
          engagement: e,
          rate: v ? (e ?? 0) / v : null,
          posts: own0.has
            ? listContent.filter((r) => r.platform === p && fmts(p).includes(r.format) && r.published_at.slice(0, 10) >= own0.start && r.published_at.slice(0, 10) <= own0.end).length
            : 0,
          follow: { value: fl.value, note: fl.note, source: fl.source },
          spark: own0.has && !isTotal ? Array.from({ length: own0.days }, (_, i) => day(p, fmts(p), addDays(own0.start, i)).views) : [],
        };
      })
    : null;

  return {
    periodLabel: o.label,
    lastNote,
    coverage,
    prevLabel: canCompare && prev ? prev.label : null,
    has: o.has,
    isTotal,
    kpi: {
      views,
      viewsChange: cur && before ? change(cur.views, before.views) : null,
      engagement: eng,
      engagementChange: cur && before ? change(engasjement(cur), engasjement(before)) : null,
      rate,
      rateDiff: rate != null && prevRate != null ? rate - prevRate : null,
      followersNow: now.length ? now.reduce((s, f) => s + (followersNow(f)?.value ?? 0), 0) : null,
      followers: plats.map((p) => {
        const fr = folRange(o);
        return followerLine(p, fr.start, fr.end, fr.ok);
      }),
    },
    chart: { days: chartDays, note: isTotal && chartStart > o.start ? `Grafen viser døgn fra ${dm(chartStart)}, da alle valgte plattformer har døgntall.` : null },
    sentences,
    cards,
  };
}

/** «Færre visninger enn de 7 dagene før (−21 %). Kommentarer opp, likes ned.» */
export function sentence(a: Metrics, b: Metrics, days: number): string {
  const dir = Math.sign(a.views - b.views);
  const nums =
    b.views >= PERCENT_MIN_PREV
      ? ` (${dir >= 0 ? "+" : "−"}${Math.round(Math.abs((a.views - b.views) / b.views) * 100)} %)`
      : ` (${a.views} mot ${b.views})`;
  const what = `de ${days} ${days === 1 ? "dagen" : "dagene"} før`;
  const first = dir > 0 ? `Flere visninger enn ${what}${nums}` : dir < 0 ? `Færre visninger enn ${what}${nums}` : `Like mange visninger som ${what}`;
  const ups: string[] = [];
  const downs: string[] = [];
  for (const [k, l] of [["likes", "likes"], ["comments", "kommentarer"], ["shares", "delinger"]] as const) {
    if (a[k] > b[k]) ups.push(l);
    else if (a[k] < b[k]) downs.push(l);
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const second =
    ups.length && !downs.length
      ? `${dir < 0 ? ", men" : ", og"} mer engasjement: ${joinNo(ups)} opp.`
      : downs.length && !ups.length
        ? `${dir > 0 ? ", men" : ", og"} lavere engasjement: ${joinNo(downs)} ned.`
        : ups.length
          ? `. ${cap(joinNo(ups))} opp, ${joinNo(downs)} ned.`
          : ". Engasjementet er uendret.";
  return first + second;
}
