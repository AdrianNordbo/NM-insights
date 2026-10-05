import { describe, expect, it } from "vitest";
import type { PlatformSummaryRow } from "../data/types";
import { buildSeries, comparePeriod, sumRange, trend } from "./aktivitet";
import { hrefFor, navigation, readState, visibleSeries } from "./adresse";
import { change, pillText } from "./endring";
import { osloToday, pacificToday } from "../format";
import { engagementRow, heroCard } from "./kort";
import { currentPeriod, parsePeriodKey, periodKey, periodLabel, periodOf, prevPeriod } from "./periode";
import { summarySentence } from "./sammendrag";
import { days } from "./testdata";

describe("perioder", () => {
  it("uke 39 2026 er 21.–27.09", () => {
    const p = periodOf("uke", "2026-09-24");
    expect(p).toEqual({ type: "uke", start: "2026-09-21", end: "2026-09-27" });
    expect(periodKey(p)).toBe("2026-W39");
    expect(periodLabel(p)).toBe("Uke 39 · 21.09–27.09");
  });

  it("uke over årsskiftet hører til ISO-året (uke 53 2026 og uke 1 2027)", () => {
    expect(periodKey(periodOf("uke", "2027-01-01"))).toBe("2026-W53");
    expect(periodKey(periodOf("uke", "2027-01-04"))).toBe("2027-W01");
    expect(parsePeriodKey("uke", "2026-W53")?.start).toBe("2026-12-28");
    expect(parsePeriodKey("uke", "2027-W01")?.start).toBe("2027-01-04");
    expect(periodKey(periodOf("uke", "2025-12-29"))).toBe("2026-W01");
  });

  it("leser og skriver måneder, og avviser ugyldige nøkler", () => {
    expect(parsePeriodKey("måned", "2026-02")).toEqual({ type: "måned", start: "2026-02-01", end: "2026-02-28" });
    expect(parsePeriodKey("måned", "2026-13")).toBeNull();
    expect(parsePeriodKey("uke", "2026-W54")).toBeNull();
    expect(parsePeriodKey("uke", "tull")).toBeNull();
    expect(periodOf("måned", "2026-12-15").end).toBe("2026-12-31");
    expect(prevPeriod(periodOf("måned", "2026-03-10")).start).toBe("2026-02-01");
  });

  it("standardperioden er alltid inneværende periode etter Oslo-kalenderen", () => {
    expect(periodKey(currentPeriod("uke", "2026-10-05"))).toBe("2026-W41"); // første døgn i uken
    expect(periodKey(currentPeriod("uke", "2026-10-11"))).toBe("2026-W41"); // siste døgn i uken
    expect(periodKey(currentPeriod("måned", "2026-10-05"))).toBe("2026-10");
    expect(periodLabel(currentPeriod("uke", "2026-10-05"))).toBe("Uke 41 · 05.10–11.10");
  });

  it("mandag morgen norsk tid gir uke 41, selv om det fortsatt er søndag i Stillehavstid", () => {
    const mondayMorning = new Date("2026-10-05T05:30:00Z"); // 07:30 i Oslo, 22:30 søndag i California
    expect(osloToday(mondayMorning)).toBe("2026-10-05");
    expect(pacificToday(mondayMorning)).toBe("2026-10-04");
    expect(periodKey(currentPeriod("uke", osloToday(mondayMorning)))).toBe("2026-W41");
    expect(periodKey(currentPeriod("uke", pacificToday(mondayMorning)))).toBe("2026-W40"); // feil kilde
    // Like etter midnatt i Oslo søndag kveld UTC er det også mandag i Oslo.
    expect(osloToday(new Date("2026-10-04T22:10:00Z"))).toBe("2026-10-05");
  });

  it("årsskifte og månedsskifte følger Oslo-kalenderen", () => {
    const newYear = new Date("2026-12-31T23:30:00Z"); // 00:30 1. januar i Oslo
    expect(osloToday(newYear)).toBe("2027-01-01");
    expect(periodKey(currentPeriod("uke", osloToday(newYear)))).toBe("2026-W53");
    expect(periodKey(currentPeriod("måned", osloToday(newYear)))).toBe("2027-01");
    expect(periodKey(currentPeriod("uke", "2027-01-04"))).toBe("2027-W01");
    const newMonth = new Date("2026-10-31T23:30:00Z"); // 00:30 1. november i Oslo (vintertid)
    expect(periodKey(currentPeriod("måned", osloToday(newMonth)))).toBe("2026-11");
  });
});

describe("endring", () => {
  it("viser prosent bare når forrige verdi er minst 1 000", () => {
    expect(change(1220, 1000)).toEqual({ direction: "up", percent: 0.22, prev: 1000 });
    expect(change(500, 999)?.percent).toBeNull();
    expect(pillText(change(1220, 1000)!)).toBe("▲ 22 %"); // nb-NO har hardt mellomrom før %
    expect(pillText(change(3, 19)!)).toBe("▼");
    expect(pillText(change(5, 5)!)).toBe("=");
    expect(change(5, null)).toBeNull();
  });
});

describe("aktivitet", () => {
  const rows = [
    ...days("instagram", "REELS", "2026-07-01", "2026-09-30", 100, "2026-09-30"),
    ...days("instagram", "FEED", "2026-07-01", "2026-09-30", 10, "2026-09-30"),
    ...days("instagram", "ALL", "2026-07-01", "2026-09-30", 120, "2026-09-30"),
    ...days("youtube", "SHORTS", "2026-08-10", "2026-09-28", 7, "2026-09-28"),
  ];
  const series = buildSeries(rows);
  const reels = series.find((s) => s.format === "REELS")!;
  const shorts = series.find((s) => s.format === "SHORTS")!;

  it("bygger én serie per plattform og format, og bruker aldri ALL", () => {
    expect(series.map((s) => `${s.platform}-${s.format}`)).toEqual(["instagram-REELS", "instagram-FEED", "youtube-SHORTS"]);
    expect(sumRange(reels, "2026-09-21", "2026-09-27").metrics.views).toBe(700);
  });

  it("ferdig periode sammenlignes med hele forrige periode, også når den er kortere", () => {
    const c = comparePeriod(reels, periodOf("måned", "2026-08-01")); // 31 dager mot juli (31)
    expect(c.current.metrics.views).toBe(3100);
    expect(c.prev?.metrics.views).toBe(3100);
    const sep = comparePeriod(reels, periodOf("måned", "2026-09-01")); // 30 dager mot august (31)
    expect(sep.partial).toBe(false);
    expect(sep.prev?.metrics.views).toBe(3100);
    expect(sep.prevRange).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("uferdig måned sammenlignes med like mange dager i forrige måned", () => {
    const c = comparePeriod(shorts, periodOf("måned", "2026-09-01")); // t.o.m. 28.09
    expect(c.partial).toBe(true);
    expect(c.current.days).toBe(28);
    expect(c.prevRange).toEqual({ start: "2026-08-01", end: "2026-08-28" });
  });

  it("uferdig måned som er lengre enn hele forrige måned, sammenlignes med hele forrige måned", () => {
    const march = buildSeries(days("instagram", "REELS", "2026-01-01", "2026-03-30", 10, "2026-03-30"))[0];
    const c = comparePeriod(march, periodOf("måned", "2026-03-01")); // 30 dager hittil, februar har 28
    expect(c.partial).toBe(true);
    expect(c.current.days).toBe(30);
    expect(c.prevRange).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(c.prev?.metrics.views).toBe(280);
  });

  it("uferdig måned som er kortere enn forrige måned, bruker like mange dager", () => {
    const feb = buildSeries(days("instagram", "REELS", "2026-01-01", "2026-02-10", 10, "2026-02-10"))[0];
    const c = comparePeriod(feb, periodOf("måned", "2026-02-01"));
    expect(c.current.days).toBe(10);
    expect(c.prevRange).toEqual({ start: "2026-01-01", end: "2026-01-10" });
    expect(c.prev?.metrics.views).toBe(100);
  });

  it("ingen sammenligning når plattformen ikke hadde data i forrige periode", () => {
    const c = comparePeriod(shorts, periodOf("uke", "2026-08-10")); // første uke med data
    expect(c.prev).toBeNull();
    expect(c.current.metrics.views).toBe(49);
  });

  it("trenden er null før kontoen har data", () => {
    const t = trend(shorts, periodOf("uke", "2026-09-21"), "views", 12);
    expect(t).toHaveLength(12);
    expect(t[0].value).toBeNull();
    expect(t.at(-1)?.value).toBe(49);
  });

  it("lagringer finnes bare for Instagram", () => {
    const p = periodOf("uke", "2026-09-21");
    expect(engagementRow(reels, p, "2026-09-30")?.tiles.map((t) => t.key)).toEqual(["likes", "comments", "shares", "saves"]);
    expect(engagementRow(shorts, p, "2026-09-30")?.tiles.map((t) => t.key)).toEqual(["likes", "comments", "shares"]);
  });

  it("plattformkortet merker uferdig periode «hittil, t.o.m. dd.mm» og viser forrige periodes datoer", () => {
    const card = heroCard(shorts, periodOf("uke", "2026-09-28"), [], [], "2026-09-29", "2026-09-28");
    expect(card.partialNote).toBe("hittil, t.o.m. 28.09");
    expect(card.views).toBe(7);
    expect(card.delta.prevLabel).toBe("uke 39, 21.09");
    expect(card.delta.change?.percent).toBeNull();
  });

  it("plattform som ligger etter siste ferdige døgn merkes «data til og med dd.mm»", () => {
    // YouTube t.o.m. 28.09, mens Meta har data til og med 30.09 (siste ferdige Stillehavsdøgn).
    const p = periodOf("uke", "2026-09-28");
    expect(heroCard(shorts, p, [], [], "2026-10-01", "2026-09-30").partialNote).toBe("data til og med 28.09");
    expect(heroCard(reels, p, [], [], "2026-10-01", "2026-09-30").partialNote).toBe("hittil, t.o.m. 30.09");
    expect(engagementRow(shorts, p, "2026-09-30")?.partialNote).toBe("data til og med 28.09");
  });

  it("første døgn i uken: ingen data ennå gir «–», «data til og med dd.mm» og ingen setning", () => {
    // Mandag 05.10 i Oslo: Meta har data til og med søndag 04.10 (Stillehavstid) eller tidligere.
    const monday = buildSeries(days("instagram", "REELS", "2026-09-01", "2026-10-03", 100, "2026-10-03"))[0];
    const p = currentPeriod("uke", "2026-10-05");
    const card = heroCard(monday, p, [], [], "2026-10-05", "2026-10-03");
    expect(card.views).toBeNull();
    expect(card.partialNote).toBe("data til og med 03.10");
    expect(card.delta.change).toBeNull();
    expect(engagementRow(monday, p, "2026-10-03")?.tiles.every((t) => t.value === null)).toBe(true);
    expect(summarySentence(monday, p, [])).toBeNull();
    // Når søndagens døgn er ferdig, er uken fortsatt tom: samme visning, ingen ekstra tekst.
    expect(heroCard(monday, p, [], [], "2026-10-05", "2026-10-04").partialNote).toBe("data til og med 03.10");
  });

  it("andre døgn i uken: «hittil» og sammenligning mot like mange dager", () => {
    const tuesday = buildSeries(days("instagram", "REELS", "2026-09-01", "2026-10-05", 100, "2026-10-05"))[0];
    const card = heroCard(tuesday, currentPeriod("uke", "2026-10-06"), [], [], "2026-10-06", "2026-10-05");
    expect(card.partialNote).toBe("hittil, t.o.m. 05.10");
    expect(card.views).toBe(100);
    expect(card.delta.prevLabel).toBe("uke 40, 28.09");
  });

  it("nye følgere vises bare når alle dagene har data", () => {
    const row = (days_with_follower_data: number): PlatformSummaryRow => ({
      platform: "instagram", account_id: 1, format: "REELS", period_type: "uke", period_start: "2026-09-21",
      period_end: "2026-09-27", period_complete: true, published: 1, mature_posts: 1, median_views: 1,
      new_followers: 7, days_with_follower_data, followers_end: 507, prev_published: null, prev_mature_posts: null,
      prev_median_views: null, prev_new_followers: null, prev_days_with_follower_data: null, prev_followers_end: null,
    });
    const p = periodOf("uke", "2026-09-21");
    expect(heroCard(reels, p, [], [row(7)], "2026-10-01", "2026-09-30").followers).toMatchObject({ total: 507, newInPeriod: 7 });
    expect(heroCard(reels, p, [], [row(6)], "2026-10-01", "2026-09-30").followers?.newInPeriod).toBeNull();
  });
});

describe("adressen", () => {
  const series = buildSeries([
    ...days("instagram", "REELS", "2026-07-01", "2026-09-30", 100, "2026-09-30"),
    ...days("instagram", "FEED", "2026-07-01", "2026-09-30", 10, "2026-09-30"),
    ...days("youtube", "SHORTS", "2026-08-10", "2026-09-28", 7, "2026-09-28"),
  ]);

  const TODAY = "2026-10-05"; // mandag, uke 41

  it("Feed er av som standard og slås på med feed=1", () => {
    expect(readState({}, TODAY).feed).toBe(false);
    expect(visibleSeries(series, false).map((s) => s.format)).toEqual(["REELS", "SHORTS"]);
    expect(visibleSeries(series, true).map((s) => s.format)).toEqual(["REELS", "FEED", "SHORTS"]);
    expect(readState({ feed: "1" }, TODAY).feed).toBe(true);
  });

  it("leser periode fra adressen og faller tilbake til inneværende periode", () => {
    expect(periodKey(readState({}, TODAY).period)).toBe("2026-W41");
    expect(periodKey(readState({ periode: "måned" }, TODAY).period)).toBe("2026-10");
    expect(periodKey(readState({ periode: "uke", p: "2026-W30" }, TODAY).period)).toBe("2026-W30");
    expect(periodKey(readState({ periode: "uke", p: "ugyldig" }, TODAY).period)).toBe("2026-W41");
  });

  it("lenkene beholder Feed-valget, stopper ved første periode med data og ved inneværende periode", () => {
    const state = readState({ periode: "uke", p: "2026-W27", feed: "1" }, TODAY); // 29.06–05.07
    expect(hrefFor(state)).toBe("/?periode=uke&p=2026-W27&feed=1");
    const nav = navigation(state, series, TODAY);
    expect(nav.prev).toBeNull();
    expect(nav.feedToggle).toBe("/?periode=uke&p=2026-W27");
    expect(nav.week).toBe("/?periode=uke&p=2026-W41&feed=1");
    expect(nav.month).toBe("/?periode=m%C3%A5ned&p=2026-10&feed=1");
    // Uke 40 har data bare til 30.09, men neste uke (inneværende) kan likevel åpnes.
    const w40 = navigation(readState({ periode: "uke", p: "2026-W40" }, TODAY), series, TODAY);
    expect(w40.next).toBe("/?periode=uke&p=2026-W41");
    const current = navigation(readState({}, TODAY), series, TODAY);
    expect(current.next).toBeNull();
    expect(current.prev).toBe("/?periode=uke&p=2026-W40");
  });
});
