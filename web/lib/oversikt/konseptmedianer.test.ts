import { describe, expect, it } from "vitest";
import { buildConceptSummary } from "./konseptmedianer";
import { post } from "./testdata";

describe("buildConceptSummary (som dashboard.concept_summary)", () => {
  it("median per plattform + format + konsept + special_event, bare modne innlegg", () => {
    const rows = [
      post("instagram", "REELS", "2026-09-01T19:00:00", 100, { likes: 10, comments: 0 }),
      post("instagram", "REELS", "2026-09-02T19:00:00", 200, { likes: 10, comments: 10 }),
      post("instagram", "REELS", "2026-09-03T19:00:00", 300, { likes: 30, comments: 0, is_mature: false }),
      post("instagram", "REELS", "2026-09-04T19:00:00", 900, { special_event: "VM 2026" }),
      post("youtube", "SHORTS", "2026-09-01T19:00:00", 50),
    ];
    const s = buildConceptSummary(rows);
    const ig = s.find((r) => r.platform === "instagram" && !r.special_event)!;
    expect(ig).toMatchObject({ posts: 2, median_views: 150, median_likes: 10, median_comments: 5, preliminary: true });
    expect(ig.median_engagement_per_view).toBeCloseTo((0.1 + 0.1) / 2);
    expect(s.find((r) => r.special_event === "VM 2026")?.posts).toBe(1);
    expect(s).toHaveLength(3);
  });

  it("null-visninger telles i antall, men ikke i medianen (percentile_cont)", () => {
    const rows = [post("tiktok", "VIDEO", "2026-09-01T19:00:00", 100), post("tiktok", "VIDEO", "2026-09-02T19:00:00", 0, { views: null })];
    const [r] = buildConceptSummary(rows);
    expect(r.posts).toBe(2);
    expect(r.median_views).toBe(100);
  });

  it("6 innlegg er ikke foreløpig", () => {
    const rows = Array.from({ length: 6 }, (_, i) => post("instagram", "REELS", `2026-09-0${i + 1}T19:00:00`, 100));
    expect(buildConceptSummary(rows)[0].preliminary).toBe(false);
  });
});
