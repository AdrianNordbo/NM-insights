import { describe, expect, it } from "vitest";
import { isKnown, onlyKnown, onlyKnownPlatforms } from "../data/kjente";
import type { ContentLatestRow, DailyActivityRow } from "../data/types";
import { buildSeries } from "./aktivitet";
import { freshGroups } from "./ferske";
import { seriesName } from "./kort";
import { periodOf } from "./periode";
import { buildTopp, expectedFor } from "./side";
import { days, post } from "./testdata";
import { buildTotal } from "./total";

const TODAY = "2026-10-14";
const EXPECTED = { "America/Los_Angeles": "2026-10-13", UTC: "2026-10-13" };

const daily: DailyActivityRow[] = [
  ...days("instagram", "REELS", "2026-09-01", "2026-10-13", 100, "2026-10-13"),
  ...days("youtube", "SHORTS", "2026-09-01", "2026-10-11", 10, "2026-10-11"),
  ...days("tiktok", "ALL", "2026-08-14", "2026-10-12", 1000, "2026-10-12", { saves: null }),
];

const content: ContentLatestRow[] = [
  post("instagram", "REELS", "2026-10-12T19:00:00", 500, { age_days: 1.6, is_mature: false }),
  post("youtube", "SHORTS", "2026-10-12T19:00:00", 50, { age_days: 1.6, is_mature: false }),
  post("tiktok", "VIDEO", "2026-07-01T18:00:00", 90000, { special_event: "VM 2026" }),
  post("tiktok", "VIDEO", "2026-10-07T21:00:00", 1883, { age_days: 6.5, is_mature: false }),
  post("tiktok", "VIDEO", "2026-10-13T21:00:00", 819, { age_days: 0.6, is_mature: false, pending: true }),
];

describe("ukjente plattformer og formater ignoreres", () => {
  it("bare kjente kombinasjoner beholdes", () => {
    expect(isKnown({ platform: "tiktok", format: "VIDEO" })).toBe(true);
    expect(isKnown({ platform: "tiktok", format: "SHORTS" })).toBe(false);
    expect(isKnown({ platform: "facebook", format: "REELS" })).toBe(false);
    expect(isKnown({ platform: "youtube", format: "VIDEO" })).toBe(false); // YouTubes lange videoer er holdt utenfor
    const rows = [...content, { ...content[0], platform: "facebook" } as unknown as ContentLatestRow];
    expect(onlyKnown(rows)).toHaveLength(content.length);
    expect(onlyKnownPlatforms([...daily, { ...daily[0], platform: "linkedin" } as unknown as DailyActivityRow])).toHaveLength(daily.length);
  });

  it("siden bygges uten TikTok-rader, uten pending og uten day_tz (før migreringen)", () => {
    const old = daily.filter((r) => r.platform !== "tiktok");
    const topp = buildTopp(old, [], content.filter((c) => c.platform !== "tiktok"), {}, TODAY, "2026-10-13");
    expect(topp.heroes.map((h) => h.platform)).toEqual(["instagram", "youtube"]);
    const total = buildTopp(old, [], content.filter((c) => c.platform !== "tiktok"), { periode: "total" }, TODAY, "2026-10-13").total!;
    expect(total.platforms.map((p) => p.platform)).toEqual(["instagram", "youtube"]);
  });
});

describe("TikTok-serien", () => {
  const series = buildSeries(daily);
  const tt = series.find((s) => s.platform === "tiktok")!;

  it("bygger på hele kontoen (ALL), heter «TikTok» og har UTC-døgn", () => {
    expect(tt.format).toBe("VIDEO");
    expect(seriesName(tt)).toBe("TikTok");
    expect(tt.dayTz).toBe("UTC"); // standard når viewet mangler day_tz
    expect(tt.hasSaves).toBe(false);
    expect(series.find((s) => s.platform === "youtube")!.dayTz).toBe("America/Los_Angeles");
  });

  it("bruker day_tz fra viewet når den finnes", () => {
    const withTz = buildSeries(days("tiktok", "ALL", "2026-10-01", "2026-10-02", 5, "2026-10-02", { day_tz: "UTC" }));
    expect(withTz[0].dayTz).toBe("UTC");
  });

  it("siste ferdige døgn regnes i plattformens tidssone", () => {
    const e = { "America/Los_Angeles": "2026-10-12", UTC: "2026-10-13" };
    expect(expectedFor(e, tt)).toBe("2026-10-13");
    expect(expectedFor(e, series[0])).toBe("2026-10-12");
    expect(expectedFor("2026-10-12", tt)).toBe("2026-10-12"); // én dato gjelder alle (som før)
  });

  it("kortet: visninger fra kontoen, «data til og med» når TikTok ligger etter, innlegg = TikTok-videoer", () => {
    const topp = buildTopp(daily, [], content, { periode: "uke", p: "2026-W42" }, TODAY, EXPECTED);
    const card = topp.heroes.find((h) => h.platform === "tiktok")!;
    expect(card.name).toBe("TikTok");
    expect(card.partialNote).toBe("data til og med 12.10");
    expect(card.views).toBe(1000); // uke 42 starter 12.10, og TikTok har data t.o.m. 12.10: ett døgn
    expect(card.posts).toBe(1); // TikTok-videoen fra 13.10
  });
});

describe("ferske TikTok-innlegg", () => {
  const groups = freshGroups(content, false);

  it("grupper i fast rekkefølge: Instagram, YouTube, TikTok", () => {
    expect(groups.map((g) => g.id)).toEqual(["instagram-REELS", "youtube-SHORTS", "tiktok-VIDEO"]);
    expect(groups[2].name).toBe("TikTok · Video");
  });

  it("innlegg TikTok ikke har behandlet, vises som «venter», ikke som tall", () => {
    const [pending, ready] = groups[2].posts;
    expect(pending.pending).toBe(true);
    expect(pending.views).toBeNull();
    expect(ready.pending).toBe(false);
    expect(ready.views).toBe(1883);
    expect(groups[0].posts[0].pending).toBe(false); // Instagram uten pending-kolonne
  });
});

describe("Total med TikTok", () => {
  const takeover = { instagram: "2026-06-15", youtube: "2026-06-15", tiktok: "2026-06-15" };
  const total = buildTotal(content, takeover, TODAY)!;

  it("Instagram + YouTube + TikTok i fast rekkefølge, og TikTok med alle aldre (også VM og ventende)", () => {
    expect(total.platforms.map((p) => p.platform)).toEqual(["instagram", "youtube", "tiktok"]);
    const tt = total.platforms[2];
    expect(tt.views).toBe(90000 + 1883 + 819);
    expect(tt.posts).toBe(3);
    expect(total.views).toBe(500 + 50 + tt.views);
  });

  it("uten startdato for TikTok er TikTok ikke med", () => {
    expect(buildTotal(content, { instagram: "2026-06-15", youtube: "2026-06-15" }, TODAY)!.platforms).toHaveLength(2);
  });
});

it("periodeoppslaget brukt i testene", () => {
  expect(periodOf("uke", "2026-10-12").start).toBe("2026-10-12");
});
