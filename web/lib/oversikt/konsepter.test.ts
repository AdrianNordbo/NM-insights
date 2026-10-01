import { describe, expect, it } from "vitest";
import type { ConceptSummaryRow } from "../data/types";
import { barScale, buildConceptBlocks, sparkFor } from "./konsepter";
import { buildRecent } from "./sist";
import { post } from "./testdata";

function summary(concept: string, posts: number, median: number, extra: Partial<ConceptSummaryRow> = {}): ConceptSummaryRow {
  return {
    platform: "instagram", account_id: 1, format: "REELS", concept, special_event: null, posts,
    median_views: median, median_likes: 1, median_comments: 0, preliminary: posts < 6,
    median_engagement_per_view: 0.01, ...extra,
  };
}

const concepts: ConceptSummaryRow[] = [
  summary("Sitcom", 15, 684),
  summary("Uten kompetanse", 14, 1370),
  summary("Folka Først", 44, 652),
  summary("Bankinfo", 1, 213),
  summary("Før konsepter", 30, 400),
  summary("Annet", 9, 30000, { special_event: "VM 2026" }),
  summary("CTF", 20, 100, { format: "FEED" }),
];

const content = [
  // Sitcom: aktiv (innlegg 29.09), 12 modne innlegg
  ...Array.from({ length: 12 }, (_, i) =>
    post("instagram", "REELS", `2026-07-${String(i + 1).padStart(2, "0")}T19:00:00`, 100 + i, { concept: "Sitcom", age_days: 80 }),
  ),
  post("instagram", "REELS", "2026-09-29T19:00:00", 1008, { concept: "Sitcom", is_mature: false, age_days: 1 }),
  // Uten kompetanse: aktiv, men Folka Først er avsluttet (siste innlegg i juli)
  post("instagram", "REELS", "2026-09-17T19:00:00", 1934, { concept: "Uten kompetanse", age_days: 13.5 }),
  post("instagram", "REELS", "2026-09-18T19:00:00", 500, { concept: "Uten kompetanse", age_days: 12.5 }),
  post("instagram", "REELS", "2026-07-20T19:00:00", 652, { concept: "Folka Først", age_days: 72 }),
  post("instagram", "REELS", "2026-09-20T19:00:00", 213, { concept: "Bankinfo" }),
  post("instagram", "REELS", "2026-07-04T19:00:00", 47000, { concept: "Annet", special_event: "VM 2026", age_days: 88 }),
];

describe("konsepttabellen", () => {
  const [reels] = buildConceptBlocks(concepts, content, "2026-10-01", false, false);

  it("aktive først, så avsluttede, så foreløpige nederst, etter median innenfor hver gruppe", () => {
    expect(reels.lines.map((l) => [l.concept, l.status])).toEqual([
      ["Uten kompetanse", "aktiv"],
      ["Sitcom", "aktiv"],
      ["Folka Først", "avsluttet"],
      ["Bankinfo", "forelopig"],
    ]);
  });

  it("spesielle hendelser ligger for seg, og «Før konsepter» er skjult til bryteren slås på", () => {
    expect(reels.events.map((e) => `${e.event} ${e.concept}`)).toEqual(["VM 2026 Annet"]);
    expect(reels.hidden).toBe(1);
    const all = buildConceptBlocks(concepts, content, "2026-10-01", true, false)[0];
    expect(all.lines.map((l) => l.concept)).toContain("Før konsepter");
    expect(all.hidden).toBe(0);
  });

  it("Feed vises bare når bryteren er på", () => {
    expect(buildConceptBlocks(concepts, content, "2026-10-01", false, false).map((b) => b.format)).toEqual(["REELS"]);
    expect(buildConceptBlocks(concepts, content, "2026-10-01", false, true).map((b) => b.format)).toEqual(["REELS", "FEED"]);
  });

  it("trendlinjen er de siste 10 modne innleggene, eldst først, uten spesielle hendelser", () => {
    const spark = sparkFor(content, "instagram", "REELS", "Sitcom");
    expect(spark).toHaveLength(10);
    expect(spark.map((p) => p.value)).toEqual([102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
    expect(spark[0].label).toBe("03.07 · Innlegg 2026-07-03");
    expect(sparkFor(content, "instagram", "REELS", "Annet")).toEqual([]);
  });

  it("stolpene skaleres etter de ikke-foreløpige radene, og foreløpige kappes", () => {
    const scale = barScale(reels.lines, "medianViews");
    expect(scale(1370)).toBe(100);
    expect(Math.round(scale(684))).toBe(50);
    expect(scale(5000)).toBe(100);
    expect(scale(null)).toBe(0);
  });
});

describe("hva funket sist", () => {
  it("beste innlegg 7–14 dager gamle, med ×N av vanlig for konseptet", () => {
    const [reels] = buildRecent(content, concepts, false);
    expect(reels.state).toBe("best");
    expect(reels.post?.title).toBe("Innlegg 2026-09-17");
    expect(reels.ratio).toBeCloseTo(1934 / 1370);
    expect(reels.highlight).toBe(true);
  });

  it("fremheves ikke når innlegget er det eneste eller konseptet er foreløpig", () => {
    const single = buildRecent([content.find((c) => c.views === 1934)!], concepts, false)[0];
    expect(single.state).toBe("single");
    expect(single.highlight).toBe(false);
    const prelim = buildRecent(
      [post("instagram", "REELS", "2026-09-20T19:00:00", 900, { concept: "Bankinfo", age_days: 10 }), post("instagram", "REELS", "2026-09-21T19:00:00", 10, { age_days: 9 })],
      concepts,
      false,
    )[0];
    expect(prelim.preliminary).toBe(true);
    expect(prelim.highlight).toBe(false);
  });

  it("ingen innlegg i perioden, og Feed bare med bryteren på", () => {
    const feedPost = post("instagram", "FEED", "2026-09-01T10:00:00", 50, { age_days: 30 });
    expect(buildRecent([feedPost], concepts, false)).toEqual([]);
    expect(buildRecent([feedPost], concepts, true)[0].state).toBe("none");
  });
});
