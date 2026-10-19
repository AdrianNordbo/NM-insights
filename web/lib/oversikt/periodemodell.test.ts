import { describe, expect, it } from "vitest";
import { plattformValg } from "../regler/plattformer";
import { buildSeries } from "./aktivitet";
import { buildOversikt, type ModellInput, sentence } from "./periodemodell";
import { days, post } from "./testdata";
import { periodeValg } from "./valg";

const TODAY = "2026-10-19";
// Instagram og TikTok har tall t.o.m. 18.10, YouTube t.o.m. 16.10. TikTok har døgntall først fra 14.08.
const daily = [
  ...days("instagram", "REELS", "2026-06-01", "2026-10-18", 100, "2026-10-18"),
  ...days("instagram", "FEED", "2026-06-01", "2026-10-18", 10, "2026-10-18"),
  ...days("youtube", "SHORTS", "2026-06-04", "2026-10-16", 20, "2026-10-16"),
  ...days("tiktok", "ALL", "2026-08-14", "2026-10-18", 50, "2026-10-18"),
];
const content = [
  post("instagram", "REELS", "2026-10-13T19:00:00", 1000, { likes: 10, comments: 2, shares: 3 }),
  post("instagram", "FEED", "2026-10-14T12:00:00", 300, { concept: "Bankinfo", likes: 1, comments: 0, shares: 0 }),
  post("youtube", "SHORTS", "2026-10-13T19:00:00", 200, { likes: 5, comments: 0, shares: 1 }),
  post("tiktok", "VIDEO", "2026-10-13T19:00:00", 400, { likes: 20, comments: 1, shares: 2 }),
];
const input = (over: Partial<ModellInput> = {}): ModellInput => ({
  series: buildSeries(daily),
  content,
  listContent: content.filter((r) => r.concept !== "Bankinfo"),
  followers: [],
  total: null,
  takeover: { instagram: "2026-06-15", youtube: "2026-06-15", tiktok: "2026-06-15" },
  today: TODAY,
  ...over,
});
const build = (pl: string, pe: string, over?: Partial<ModellInput>) => buildOversikt(plattformValg(pl), periodeValg(pe, TODAY), input(over))!;

describe("siste døgn", () => {
  it("Alle bruker siste døgn alle plattformene har data for", () => {
    const m = build("alle", "forrige-uke");
    expect(m.lastNote).toBe("alle plattformer, t.o.m. 16.10");
    expect(m.chart.days.at(-1)?.date).toBe("2026-10-16");
  });
  it("én plattform bruker sitt eget siste døgn", () => {
    expect(build("instagram-reels", "forrige-uke").lastNote).toBe("data til og med 18.10");
  });
});

describe("summer", () => {
  it("Alle: Feed er med i totaltallet, men Instagram-kortet viser bare Reels", () => {
    const m = build("alle", "siste-7");
    expect(m.periodLabel).toBe("10.10–16.10");
    expect(m.kpi.views).toBe(7 * (100 + 10 + 20 + 50));
    const ig = m.cards!.find((c) => c.platform === "instagram")!;
    expect(ig.name).toBe("Instagram · Reels");
    expect(ig.views).toBe(7 * 100); // eget siste døgn 18.10 → 12.10–18.10, bare Reels
  });
  it("engasjement = likes + kommentarer + delinger; rate bare for én plattform", () => {
    const m = build("youtube", "siste-7");
    expect(m.kpi.engagement).toBe(7 * (1 + 0 + 2));
    expect(m.kpi.rate).toBeCloseTo(3 / 20);
    expect(build("alle", "siste-7").kpi.rate).toBeNull();
  });
  it("sammenligning mot like mange dager rett før", () => {
    const m = build("instagram-reels", "siste-7");
    expect(m.prevLabel).toBe("05.10–11.10 (7 dager før)");
    expect(m.kpi.viewsChange).toEqual({ direction: "same", percent: null, prev: 700 }); // under 1 000: ingen prosent
  });
  it("ingen sammenligning når en plattform mangler tall i dagene før (TikTok fra 14.08)", () => {
    const m = build("alle", "siste-90");
    expect(m.prevLabel).toBeNull();
    expect(m.kpi.viewsChange).toBeNull();
    expect(m.coverage).toBe("TikTok har tall fra 14.08");
  });
  it("ingen data i perioden ennå: has = false og tom graf", () => {
    const m = build("alle", "denne-uken");
    expect(m.has).toBe(false);
    expect(m.kpi.views).toBeNull();
    expect(m.chart.days).toEqual([]);
  });
});

describe("Total siden start", () => {
  it("levetidstall per innlegg, Bankinfo med i totalen, men ikke i innleggstallet på kortet", () => {
    const m = build("alle", "total");
    expect(m.kpi.views).toBe(1000 + 300 + 200 + 400);
    expect(m.kpi.engagement).toBe(15 + 1 + 6 + 23);
    expect(m.cards!.find((c) => c.platform === "instagram")!.posts).toBe(1);
    expect(m.chart.note).toBe("Grafen viser døgn fra 14.08, da alle valgte plattformer har døgntall.");
  });
  it("Instagram Feed alene", () => {
    expect(build("instagram-feed", "total").kpi.views).toBe(300);
  });
});

describe("følgere", () => {
  it("netto summeres aldri: én linje per plattform", () => {
    expect(build("alle", "siste-7").kpi.followers.map((f) => f.platform)).toEqual(["instagram", "youtube", "tiktok"]);
  });
});

describe("sentence", () => {
  const m = (views: number, likes = 0, comments = 0, shares = 0) => ({ views, likes, comments, shares, saves: 0 });
  it("prosent fra 1 000, ellers tallene", () => {
    expect(sentence(m(800, 2, 1, 0), m(1000, 1, 1, 1), 7)).toBe("Færre visninger enn de 7 dagene før (−20 %). Likes opp, delinger ned.");
    expect(sentence(m(836, 3), m(756, 1), 5)).toBe("Flere visninger enn de 5 dagene før (836 mot 756), og mer engasjement: likes opp.");
  });
});

describe("følgere følger kalenderperioden", () => {
  it("netto for inneværende uke selv om døgntallene for visninger ikke har kommet ennå", async () => {
    const { buildFollowerSeries } = await import("./folgere");
    const fs = buildFollowerSeries([
      { platform: "instagram", account_id: 1, day: "2026-10-18", followers_count: 515, new_followers: null, takeover_date: null, followers_start: null, followers_start_date: null, followers_start_source: null },
      { platform: "instagram", account_id: 1, day: "2026-10-19", followers_count: 516, new_followers: null, takeover_date: null, followers_start: null, followers_start_date: null, followers_start_source: null },
    ]);
    const m = build("instagram-reels", "denne-uken", { followers: fs });
    expect(m.has).toBe(false);
    expect(m.kpi.followers[0]).toMatchObject({ value: "+1", note: "hittil" });
  });
});
