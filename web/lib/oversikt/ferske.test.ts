import { describe, expect, it } from "vitest";
import { ageText, freshGroups } from "./ferske";
import { post } from "./testdata";

const content = [
  post("instagram", "REELS", "2026-09-24T19:00:00", 32758, { age_days: 6.4, title: "Vi går rundt i gaten\nmed mer tekst" }),
  post("instagram", "REELS", "2026-09-29T08:00:00", 1008, { age_days: 1.2 }),
  post("instagram", "REELS", "2026-09-27T08:00:00", 1274, { age_days: 3.1 }),
  post("instagram", "REELS", "2026-09-20T08:00:00", 5000, { age_days: 10.5 }),
  post("instagram", "FEED", "2026-09-28T08:00:00", 79, { age_days: 2 }),
  post("youtube", "SHORTS", "2026-09-29T08:00:00", 352, { age_days: 1.5 }),
  post("youtube", "SHORTS", "2026-09-30T20:00:00", 3, { age_days: 0.4 }),
];

describe("ferske innlegg", () => {
  it("bare innlegg under 7 dager, gruppert per plattform og format, nyeste først", () => {
    const groups = freshGroups(content, false);
    expect(groups.map((g) => g.name)).toEqual(["Instagram · Reels", "YouTube · Shorts"]);
    expect(groups[0].posts.map((p) => p.published)).toEqual(["29.09", "27.09", "24.09"]);
    expect(groups[1].posts.map((p) => p.published)).toEqual(["30.09", "29.09"]);
  });

  it("sorteres aldri på visninger, heller ikke innenfor en gruppe", () => {
    const reels = freshGroups(content, false)[0].posts.map((p) => p.views);
    expect(reels).toEqual([1008, 1274, 32758]);
  });

  it("Feed vises bare når bryteren er på", () => {
    expect(freshGroups(content, true).map((g) => g.format)).toEqual(["REELS", "FEED", "SHORTS"]);
  });

  it("tittel er første linje, og alderen står i hele dager", () => {
    expect(freshGroups(content, false)[0].posts[2].title).toBe("Vi går rundt i gaten");
    expect(ageText(0.4)).toBe("i dag");
    expect(ageText(1.9)).toBe("1 dag gammel");
    expect(ageText(6.4)).toBe("6 dager gammel");
  });

  it("ingen grupper når ingen innlegg er ferske", () => {
    expect(freshGroups(content.map((c) => ({ ...c, age_days: 9 })), true)).toEqual([]);
  });
});
