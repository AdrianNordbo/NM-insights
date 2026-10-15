import { describe, expect, it } from "vitest";
import type { FollowerRow, Platform } from "../data/types";
import { addDays } from "../format";
import {
  buildFollowerSeries,
  followersNow,
  followersNowSum,
  grossInPeriod,
  netto,
  nettoView,
  signed,
  sinceStartText,
  startLabel,
} from "./folgere";

const TODAY = "2026-10-15";
const ACCOUNT: Record<Platform, number> = { instagram: 1, youtube: 2, tiktok: 3 };

/** Én rad per dag fra start til og med end; total(d) og brutto(d) gir verdiene (null = ikke målt). */
function rows(
  platform: Platform,
  start: string,
  end: string,
  total: (day: string, i: number) => number | null,
  gross: (day: string, i: number) => number | null = () => null,
  extra: Partial<FollowerRow> = {},
): FollowerRow[] {
  const out: FollowerRow[] = [];
  for (let d = start, i = 0; d <= end; d = addDays(d, 1), i++) {
    out.push({
      platform,
      account_id: ACCOUNT[platform],
      day: d,
      followers_count: total(d, i),
      new_followers: gross(d, i),
      takeover_date: "2026-06-15",
      followers_start: null,
      followers_start_date: null,
      followers_start_source: null,
      ...extra,
    });
  }
  return out;
}

// Instagram: brutto fra 30.08, total fra 29.09 (505) og +1 hver tredje dag
const instagram = [
  ...rows("instagram", "2026-08-30", "2026-09-28", () => null, () => 1),
  ...rows("instagram", "2026-09-29", "2026-10-15", (_, i) => 505 + Math.floor(i / 3) + (i === 16 ? 0 : 0), (d) => (d < TODAY ? 1 : null)),
];
// YouTube: brutto 04.06–12.10 (Analytics ligger bak), total fra 30.09 (39 → 40), startverdi 0 per 15.06
const ytStart = { followers_start: 0, followers_start_date: "2026-06-15", followers_start_source: "YouTube Analytics (nye − tapte 04.06–14.06)" };
const youtube = [
  ...rows("youtube", "2026-06-04", "2026-09-29", () => null, (d) => (d === "2026-06-16" ? 3 : 0), ytStart),
  ...rows("youtube", "2026-09-30", "2026-10-15", (d) => (d < "2026-10-12" ? 39 : 40), (d) => (d <= "2026-10-12" ? 0 : null), ytStart),
];
// TikTok: total fra 14.08 (148), ingen brutto
const tiktok = rows("tiktok", "2026-08-14", "2026-10-15", (_, i) => 148 + i);

const all = buildFollowerSeries([...tiktok, ...youtube, ...instagram]);
const ig = all.find((s) => s.platform === "instagram")!;
const yt = all.find((s) => s.platform === "youtube")!;
const tt = all.find((s) => s.platform === "tiktok")!;

describe("serier og «følgere nå»", () => {
  it("én serie per plattform i fast rekkefølge, med startverdi der den finnes", () => {
    expect(all.map((s) => s.platform)).toEqual(["instagram", "youtube", "tiktok"]);
    expect(yt.start).toEqual({ value: 0, date: "2026-06-15", source: "YouTube Analytics (nye − tapte 04.06–14.06)" });
    expect(ig.start).toBeNull();
    expect(tt.gross.size).toBe(0);
  });

  it("følgere nå = siste måling, og summen er bare av totalene", () => {
    expect(followersNow(ig)).toEqual({ value: 510, day: "2026-10-15" });
    expect(followersNow(yt)).toEqual({ value: 40, day: "2026-10-15" });
    expect(followersNow(tt)).toEqual({ value: 148 + 62, day: "2026-10-15" });
    expect(followersNowSum(all)).toEqual({ total: 510 + 40 + 210, platforms: ["instagram", "youtube", "tiktok"] });
  });

  it("uten noen rader: ingen sum", () => {
    expect(followersNowSum([])).toBeNull();
    expect(buildFollowerSeries([])).toEqual([]);
  });
});

describe("netto = F(slutt) − F(dagen før start)", () => {
  it("hel periode med måling dagen før: ingen merknad", () => {
    const n = netto(tt, "2026-09-01", "2026-09-30", TODAY);
    expect(n).toMatchObject({ kind: "value", change: 30, measuredFrom: false, partial: false, start: null });
    expect(nettoView(n)).toEqual({ value: "+30", note: null, startLabel: null });
  });

  it("uferdig periode: «hittil»", () => {
    const n = netto(ig, "2026-10-12", "2026-10-18", TODAY);
    expect(n).toMatchObject({ kind: "value", from: 509, to: 510, partial: true });
    expect(nettoView(n)).toEqual({ value: "+1", note: "hittil", startLabel: null });
  });

  it("første måling inne i perioden: «målt fra dd.mm», aldri som hele perioden", () => {
    const n = netto(ig, "2026-09-01", "2026-09-30", TODAY);
    expect(n).toMatchObject({ kind: "value", from: 505, to: 505, measuredFrom: true, fromLabelDay: "2026-09-29" });
    expect(nettoView(n).note).toBe("målt fra 29.09");
  });

  it("første måling etter periodens slutt, eller bare én måling: «ikke nok data»", () => {
    expect(nettoView(netto(ig, "2026-09-07", "2026-09-13", TODAY)).value).toBe("ikke nok data");
    expect(nettoView(netto(ig, "2026-09-23", "2026-09-29", TODAY)).value).toBe("ikke nok data"); // bare 29.09 i perioden
  });

  it("ingen målinger og ingen startverdi: «–»", () => {
    const empty = buildFollowerSeries(rows("tiktok", "2026-10-01", "2026-10-02", () => null))[0];
    expect(nettoView(netto(empty, "2026-10-01", "2026-10-31", TODAY))).toEqual({ value: "–", note: null, startLabel: null });
  });

  it("hull før periodens slutt i en ferdig periode: «t.o.m. dd.mm»", () => {
    const holes = buildFollowerSeries(rows("tiktok", "2026-09-20", "2026-10-15", (d, i) => (d > "2026-09-27" && d < "2026-10-03" ? null : 200 + i)))[0];
    const n = netto(holes, "2026-09-21", "2026-09-30", TODAY);
    expect(nettoView(n)).toEqual({ value: "+7", note: "t.o.m. 27.09", startLabel: null });
  });

  it("negativ netto vises med minus, og 0 som 0", () => {
    const down = buildFollowerSeries(rows("instagram", "2026-10-01", "2026-10-10", (_, i) => 520 - i))[0];
    expect(nettoView(netto(down, "2026-10-05", "2026-10-08", TODAY)).value).toBe("−4");
    expect(nettoView(netto(yt, "2026-10-05", "2026-10-08", TODAY)).value).toBe("0");
  });
});

describe("startverdi", () => {
  it("brukes når perioden starter på startdatoen: «fra X til Y» og etikett", () => {
    const n = netto(yt, "2026-06-15", TODAY, TODAY);
    expect(n).toMatchObject({ kind: "value", from: 0, to: 40, change: 40, measuredFrom: false, fromLabelDay: "2026-06-15" });
    expect(nettoView(n)).toEqual({ value: "+40", note: "fra 0 til 40, hittil", startLabel: "beregnet fra YouTube Analytics" });
    expect(sinceStartText(n)).toBe("+40 siden 15.06");
  });

  it("startverdien alene er aldri en slutt: juni uten totalmåling gir «ikke nok data»", () => {
    expect(netto(yt, "2026-06-01", "2026-06-30", TODAY).kind).toBe("notEnough");
  });

  it("periode som starter før startdatoen: utgangspunkt i startverdien, merket «fra X til Y» med startdatoen", () => {
    const manual = { followers_start: 432, followers_start_date: "2026-09-29", followers_start_source: "manuelt (Meta Insikt)" };
    const s = buildFollowerSeries(rows("instagram", "2026-09-29", "2026-10-15", (_, i) => 505 + i, () => null, manual))[0];
    const n = netto(s, "2026-09-01", "2026-09-30", TODAY);
    expect(n).toMatchObject({ kind: "value", from: 432, to: 506, measuredFrom: true, fromLabelDay: "2026-09-29" });
    expect(nettoView(n)).toEqual({ value: "+74", note: "fra 432 til 506", startLabel: "startverdi oppgitt manuelt 29.09" });
  });

  it("uten startverdi faller Total tilbake til «siden» første måling", () => {
    expect(sinceStartText(netto(ig, "2026-06-15", TODAY, TODAY))).toBe("+5 siden 29.09");
    expect(sinceStartText(netto(tt, "2026-06-15", TODAY, TODAY))).toBe("+62 siden 14.08");
  });

  it("manuell startverdi får egen etikett, og en ekte måling samme dag går foran", () => {
    const manual = { followers_start: 432, followers_start_date: "2026-09-29", followers_start_source: "manuelt (Meta Insikt)" };
    const s = buildFollowerSeries(rows("instagram", "2026-09-29", "2026-10-15", (_, i) => 505 + i, () => null, manual))[0];
    const n = netto(s, "2026-09-29", TODAY, TODAY);
    expect(nettoView(n)).toEqual({ value: "+89", note: "fra 432 til 521, hittil", startLabel: "startverdi oppgitt manuelt 29.09" });
    // Startdato 30.09: dagen før (29.09) er målt (505), så målingen brukes og ikke startverdien
    const s2 = buildFollowerSeries(rows("instagram", "2026-09-29", "2026-10-15", (_, i) => 505 + i, () => null, { ...manual, followers_start_date: "2026-09-30" }))[0];
    expect(netto(s2, "2026-09-30", TODAY, TODAY)).toMatchObject({ from: 505, start: null });
    expect(startLabel({ value: 1, date: "2026-06-15", source: "manuelt (TikTok Studio)" })).toBe("startverdi oppgitt manuelt 15.06");
  });
});

describe("brutto nye (tilleggsinfo, egen regel for nok data)", () => {
  it("Instagram: summeres når alle forventede dager har tall", () => {
    expect(grossInPeriod(ig, "2026-10-01", "2026-10-07", TODAY)).toBe(7);
    expect(grossInPeriod(ig, "2026-10-12", "2026-10-18", TODAY)).toBe(3); // 12.–14.10, i dag teller ikke
  });

  it("YouTube: Analytics ligger bak → null de siste dagene", () => {
    expect(grossInPeriod(yt, "2026-10-12", "2026-10-18", TODAY)).toBeNull();
    expect(grossInPeriod(yt, "2026-06-15", "2026-06-21", TODAY)).toBe(3);
  });

  it("TikTok: ingen brutto", () => {
    expect(grossInPeriod(tt, "2026-10-01", "2026-10-07", TODAY)).toBeNull();
  });
});

it("tegn", () => {
  expect([signed(10), signed(-2), signed(0), signed(1234)]).toEqual(["+10", "−2", "0", "+1 234"]); // hardt mellomrom, som formatNumber
});

describe("kort og Total med og uten dashboard.followers", async () => {
  const { buildTopp } = await import("./side");
  const { days, post } = await import("./testdata");
  const daily = [
    ...days("instagram", "REELS", "2026-09-01", "2026-10-14", 100, "2026-10-14"),
    ...days("tiktok", "ALL", "2026-09-01", "2026-10-13", 50, "2026-10-13"),
  ];
  const content = [post("instagram", "REELS", "2026-09-10T19:00:00", 900), post("tiktok", "VIDEO", "2026-09-10T19:00:00", 800)];
  const followerRows = [...instagram, ...tiktok];

  it("uten viewet: kortene som før (ingen netto), og Total uten følgere", () => {
    const topp = buildTopp(daily, [], content, { periode: "uke", p: "2026-W42" }, TODAY, "2026-10-14");
    expect(topp.heroes[0].followers).toEqual({ label: "Følgere", total: null, newLabel: "Nye følgere i perioden", newInPeriod: null });
    const total = buildTopp(daily, [], content, { periode: "total" }, TODAY, "2026-10-14").total!;
    expect(total.followersNow).toBeNull();
    expect(total.platforms.every((p) => p.followers === null)).toBe(true);
  });

  it("med viewet: følgere nå, netto med merknad i raden og brutto (ikke for TikTok)", () => {
    const topp = buildTopp(daily, [], content, { periode: "måned", p: "2026-10" }, TODAY, "2026-10-14", followerRows);
    const [igCard, ttCard] = topp.heroes;
    expect(igCard.followers?.total).toBe(510);
    expect(igCard.followers?.netto).toEqual({ value: "+5", note: "hittil", startLabel: null });
    expect(igCard.followers?.gross).toEqual({ label: "Nye følgere (Meta)", value: 14 });
    expect(ttCard.followers?.netto?.value).toBe("+15");
    expect(ttCard.followers?.gross).toBeNull();
  });

  it("Total: sum av følgere nå og «siden» per kort, aldri sum av netto", () => {
    const total = buildTopp(daily, [], content, { periode: "total" }, TODAY, "2026-10-14", followerRows).total!;
    expect(total.followersNow).toBe(510 + 210);
    expect(total.platforms.map((p) => p.followers)).toEqual([
      { now: 510, since: "+5 siden 29.09", fromTo: null, startLabel: null },
      { now: 210, since: "+62 siden 14.08", fromTo: null, startLabel: null },
    ]);
  });

  it("Total med startverdi: «fra X til Y» og etikett", () => {
    const rows = [...youtube];
    const total = buildTopp(
      [...daily, ...days("youtube", "SHORTS", "2026-09-01", "2026-10-12", 5, "2026-10-12")],
      [], [...content, post("youtube", "SHORTS", "2026-09-10T19:00:00", 70)], { periode: "total" }, TODAY, "2026-10-14", rows,
    ).total!;
    expect(total.platforms.find((p) => p.platform === "youtube")?.followers).toEqual({
      now: 40, since: "+40 siden 15.06", fromTo: "fra 0 til 40", startLabel: "beregnet fra YouTube Analytics",
    });
  });
});
