// Én regelbasert setning per plattform og format i toppfeltet. Samme tall og periode som
// plattformkortene (comparePeriod). Ingen tolkning: setningen beskriver bare retningen.

import type { ContentLatestRow } from "../data/types";
import { formatNumber } from "../format";
import { comparePeriod, type MetricKey, type Series } from "./aktivitet";
import { PERCENT_MIN_PREV } from "./endring";
import { prevLabel } from "./kort";
import { type Period, periodShortLabel } from "./periode";

const ENGAGEMENT: [MetricKey, string][] = [
  ["likes", "likes"],
  ["comments", "kommentarer"],
  ["shares", "delinger"],
  ["saves", "lagringer"],
];

const signedPct = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «a», «a og b», «a, b og c». */
export function joinNo(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

/** «VM 2026» → «VM-innhold». */
export const eventWord = (event: string) => `${event.replace(/\s*\d{4}$/, "")}-innhold`;

/** Spesielle hendelser (special_event) i innlegg på samme plattform og format publisert i datoområdet. */
function eventsIn(s: Series, content: ContentLatestRow[], start: string, end: string): string[] {
  const found = content
    .filter((x) => x.special_event && x.platform === s.platform && x.format === s.format)
    .filter((x) => x.published_at.slice(0, 10) >= start && x.published_at.slice(0, 10) <= end)
    .map((x) => x.special_event as string);
  return [...new Set(found)].sort();
}

function eventNote(prev: string[], cur: string[], prevName: string, curName: string): string {
  const words = (list: string[]) => joinNo(list.map(eventWord));
  let note: string;
  if (prev.length && cur.length && prev.join() === cur.join()) note = `Både ${prevName} og ${curName} inneholdt ${words(cur)}`;
  else if (prev.length && cur.length) note = `${cap(prevName)} inneholdt ${words(prev)} og ${curName} inneholdt ${words(cur)}`;
  else if (prev.length) note = `${cap(prevName)} inneholdt ${words(prev)}`;
  else if (cur.length) note = `${cap(curName)} inneholdt ${words(cur)}`;
  else return "";
  return ` ${note}, så sammenligningen er skjev.`;
}

/** Null når plattformen ikke har data i perioden. */
export function summarySentence(s: Series, p: Period, content: ContentLatestRow[]): string | null {
  if (p.end < s.firstActive) return null;
  const c = comparePeriod(s, p);
  if (c.current.days === 0) return null; // ingen døgn med data i perioden ennå: ingen setning
  if (!c.prev || !c.prevRange) return `Ingen sammenligning: plattformen har ikke data for ${periodShortLabel(c.prevPeriod)}.`;

  const cur = c.current.metrics.views;
  const prev = c.prev.metrics.views;
  const name = prevLabel(c);
  const numbers = prev >= PERCENT_MIN_PREV ? ` (${signedPct.format((cur - prev) / prev)})` : ` (${formatNumber(cur)} mot ${formatNumber(prev)})`;
  const viewsDir = Math.sign(cur - prev);
  let first =
    viewsDir > 0 ? `Flere visninger enn ${name}${numbers}` : viewsDir < 0 ? `Færre visninger enn ${name}${numbers}` : `Like mange visninger som ${name}`;
  if (c.partial) first = `Hittil ${first.charAt(0).toLowerCase()}${first.slice(1)}`;

  const ups: string[] = [];
  const downs: string[] = [];
  for (const [key, label] of ENGAGEMENT) {
    if (key === "saves" && !s.hasSaves) continue;
    const a = c.current.metrics[key];
    const b = c.prev.metrics[key];
    if (a > b) ups.push(label);
    else if (a < b) downs.push(label);
  }
  let second: string;
  if (ups.length && !downs.length) second = `${viewsDir < 0 ? ", men" : ", og"} mer engasjement: ${joinNo(ups)} opp.`;
  else if (downs.length && !ups.length) second = `${viewsDir > 0 ? ", men" : ", og"} lavere engasjement: ${joinNo(downs)} ned.`;
  else if (ups.length && downs.length) second = `. ${cap(joinNo(ups))} opp, ${joinNo(downs)} ned.`;
  else second = ". Engasjementet er uendret.";

  const curEnd = p.end < s.through ? p.end : s.through;
  const note = eventNote(
    eventsIn(s, content, c.prevRange.start, c.prevRange.end),
    eventsIn(s, content, p.start, curEnd),
    periodShortLabel(c.prevPeriod),
    periodShortLabel(p),
  );
  return first + second + note;
}
