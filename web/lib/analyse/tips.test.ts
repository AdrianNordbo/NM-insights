import { describe, expect, it } from "vitest";
import { buildTips, list, ratio } from "./tips";
import { many, row } from "./testdata";

/** 5 innlegg kl. 17 og 5 kl. 19 (dobbelt så bra) per konsept. */
const evening = (concept: string, p = {}) => [
  ...many(concept, Array(5).fill(100), { hour: 17, ...p }),
  ...many(concept, Array(5).fill(200), { hour: 19, ...p }),
];

describe("tekst", () => {
  it("forhold med to desimaler og lister på norsk", () => {
    expect(ratio(1.309)).toBe("×1,31");
    expect(list(["A"])).toBe("A");
    expect(list(["A", "B", "C"])).toBe("A, B og C");
  });
});

describe("buildTips", () => {
  it("seksjon per plattform og format i fast rekkefølge, med grunnlag", () => {
    const rows = [
      ...evening("Sitcom", { platform: "tiktok", format: "VIDEO" }),
      ...evening("Sitcom"),
      ...many("På Gata", [100, 100, 100]),
      ...evening("Sitcom", { platform: "youtube", format: "SHORTS" }),
    ];
    const s = buildTips(rows);
    expect(s.map((x) => x.name)).toEqual(["Instagram · Reels", "YouTube · Shorts", "TikTok · Video"]);
    expect(s[0].basis).toBe("13 modne innlegg i 2 konsepter");
    expect(s[0].baseline).toEqual([
      { name: "Sitcom", posts: 10, preliminary: false },
      { name: "På Gata", posts: 3, preliminary: true },
    ]);
  });

  it("«bruk» viser grunnlaget og alle innlegg; tidsrom-sjekk med perioder", () => {
    const s = buildTips([...evening("Folka Først"), ...evening("Sitcom")]);
    const b = s[0].bruk.find((x) => x.factor === "tidsrom");
    expect(b).toMatchObject({
      title: "Publisert kl. 19–21",
      ratio: "×1,33",
      posts: 10,
      conceptCount: 2,
      support: "Folka Først og Sitcom",
      hypothesis: null,
    });
    expect(b?.tidsrom?.[0].bands).toEqual([
      { band: "kl. 17–19", posts: 5, period: "01.09", ratio: "×0,67", current: false },
      { band: "kl. 19–21", posts: 5, period: "01.09", ratio: "×1,33", current: true },
    ]);
  });

  it("«test» har hypotese og grunn", () => {
    const s = buildTips(evening("Folka Først"));
    const t = s[0].test.find((x) => x.factor === "tidsrom");
    expect(t?.hypothesis).toBe("Innlegg publisert kl. 19–21 får flere visninger enn vanlig for konseptet.");
    expect(t?.whyTest).toEqual(["bare 5 innlegg i grunnlaget (krever 10)", "bare ett konsept peker tydelig samme vei (minst ×1,05 og 3 innlegg)"]);
  });

  it("varighet viser sekunder per konsept", () => {
    const rows = [
      ...many("Sitcom", Array(5).fill(100), { duration_s: 10 }),
      ...many("Sitcom", Array(5).fill(100), { duration_s: 20 }),
      ...many("Sitcom", Array(5).fill(300), { duration_s: 30 }),
    ];
    const t = buildTips(rows)[0].test.find((x) => x.factor === "varighet");
    expect(t?.title).toBe("Lang video");
    expect(t?.concepts[0].range).toBe("30 s");
  });

  it("tom liste gir ingen seksjoner", () => {
    expect(buildTips([])).toEqual([]);
    expect(buildTips([row({ concept: "Sitcom", is_mature: false })])).toEqual([]);
  });
});
