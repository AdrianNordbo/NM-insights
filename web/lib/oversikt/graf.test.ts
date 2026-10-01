import { describe, expect, it } from "vitest";
import { buildSeries, fromPlain, toPlain } from "./aktivitet";
import { type ChartPost, chartData, interactions, peaks, placeablePeaks, rangeStart } from "./graf";
import { days } from "./testdata";

const rows = [
  ...days("instagram", "REELS", "2026-03-01", "2026-09-30", 100, "2026-09-30", { takeover_date: "2026-06-15" }),
  ...days("youtube", "SHORTS", "2026-06-15", "2026-09-28", 10, "2026-09-28", { takeover_date: "2026-06-15" }),
];
// Topper: 04.07 (VM), 24.09 (På Gata), og en liten topp 06.07 som ligger for nær 04.07.
for (const r of rows) {
  if (r.platform !== "instagram") continue;
  if (r.activity_date === "2026-07-04") r.views = 5000;
  if (r.activity_date === "2026-07-06") r.views = 3000;
  if (r.activity_date === "2026-09-24") r.views = 4000;
}
const [reels, shorts] = buildSeries(rows);
const posts: ChartPost[] = [
  { platform: "instagram", format: "REELS", day: "2026-07-02", title: "Slår vi Brasil i år og? Et veldig langt navn", views: 90000 },
  { platform: "instagram", format: "REELS", day: "2026-07-03", title: "Mindre innlegg", views: 100 },
  { platform: "instagram", format: "REELS", day: "2026-09-24", title: "Vi går rundt i gaten", views: 32758 },
  { platform: "youtube", format: "SHORTS", day: "2026-09-24", title: "Ikke denne plattformen", views: 999999 },
];

describe("utvikling per dag", () => {
  it("intervallene slutter på siste døgn med data, og Alt starter på første aktive døgn", () => {
    expect(rangeStart(reels, "7")).toBe("2026-09-24");
    expect(rangeStart(reels, "90")).toBe("2026-07-03");
    expect(rangeStart(shorts, "30")).toBe("2026-08-30");
    expect(rangeStart(shorts, "alt")).toBe("2026-06-15");
    expect(rangeStart(shorts, "90")).toBe("2026-07-01");
  });

  it("forrige periode er like mange dager rett før, med egne datoer", () => {
    const c = chartData(reels, "30", posts);
    expect(c.days).toHaveLength(30);
    expect(c.prevRange).toEqual({ start: "2026-08-02", end: "2026-08-31" });
    expect(c.days[0]).toMatchObject({ date: "2026-09-01", prevDate: "2026-08-02" });
    expect(c.days.at(-1)).toMatchObject({ date: "2026-09-30", prevDate: "2026-08-31" });
  });

  it("ingen forrige periode for Alt, eller når den ligger før dataene", () => {
    expect(chartData(reels, "alt", posts).prevRange).toBeNull();
    expect(chartData(shorts, "90", posts).prevRange).toBeNull();
    expect(chartData(shorts, "30", posts).prevRange).toEqual({ start: "2026-07-31", end: "2026-08-29" });
  });

  it("interaksjoner er likes + kommentarer + delinger, pluss lagringer bare for Instagram", () => {
    expect(interactions({ views: 9, likes: 1, comments: 2, shares: 3, saves: 4 }, true)).toBe(10);
    expect(interactions({ views: 9, likes: 1, comments: 2, shares: 3, saves: 4 }, false)).toBe(6);
    expect(chartData(reels, "7", posts).days[0].interactions).toBe(4);
    expect(chartData(shorts, "7", posts).days[0].interactions).toBe(3);
  });

  it("toppene får tittelen på innlegget med flest visninger inntil 3 dager før, og ligger minst 5 døgn fra hverandre", () => {
    const c = chartData(reels, "90", posts);
    expect(c.peaks).toEqual([
      { date: "2026-07-04", views: 5000, title: "Slår vi Brasil i år og? Et ve…" },
      { date: "2026-09-24", views: 4000, title: "Vi går rundt i gaten" },
    ]);
    expect(chartData(reels, "90", posts, 1).peaks.map((p) => p.date)).toEqual(["2026-07-04"]);
  });

  it("ingen etikett når ingen innlegg på samme plattform og format er publisert inntil 3 dager før", () => {
    const c = chartData(reels, "90", posts.filter((p) => p.day !== "2026-09-24" || p.platform === "youtube"));
    expect(c.peaks.map((p) => p.date)).toEqual(["2026-07-04"]);
    expect(peaks(shorts, chartData(shorts, "90", []).days, posts, 3)).toEqual([]);
  });

  it("markeringen vises bare når overtakelsesdatoen ligger i intervallet", () => {
    expect(chartData(reels, "alt", posts).takeover).toBe("2026-06-15");
    expect(chartData(reels, "90", posts).takeover).toBeNull();
    expect(chartData(shorts, "alt", posts).takeover).toBe("2026-06-15");
  });

  it("serien overlever turen til klienten", () => {
    const back = fromPlain(JSON.parse(JSON.stringify(toPlain(reels))));
    expect(chartData(back, "30", posts)).toEqual(chartData(reels, "30", posts));
  });

  it("etiketter som ligger for tett på skjermen fjernes, og den største toppen beholdes", () => {
    const c = chartData(reels, "alt", posts); // 04.07 og 24.09 ligger 82 døgn fra hverandre av 214
    expect(placeablePeaks(c, 1000).map((p) => p.date)).toEqual(["2026-07-04", "2026-09-24"]);
    expect(placeablePeaks(c, 300).map((p) => p.date)).toEqual(["2026-07-04"]);
  });
});
