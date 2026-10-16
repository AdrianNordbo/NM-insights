import { describe, expect, it } from "vitest";
import { analyse, type FeatureRow } from "./analyse";
import { advice, buildFungert, buildMonstre, ganger, label, list } from "./monstre";
import { many } from "./testdata";

/** Konsept med 7 innlegg kl. 17 på medianen og 5 kl. 19 med forholdet x (kl. 19 får da nøyaktig x). */
const konsept = (concept: string, x: number, p: Partial<FeatureRow> = {}) => [
  ...many(concept, Array(7).fill(100), { hour: 17, ...p }),
  ...many(concept, Array(5).fill(100 * x), { hour: 19, ...p }),
];
const kl19 = (rows: FeatureRow[]) => analyse(rows).find((f) => f.factor === "tidsrom" && f.level === "kl. 19–21");

describe("tekst", () => {
  it("ganger vanlig med to desimaler, lister på norsk", () => {
    expect(ganger(1.309)).toBe("1,31 ganger vanlig");
    expect(ganger(1.15)).toBe("1,15 ganger vanlig");
    expect(list(["A", "B", "C"])).toBe("A, B og C");
  });
});

describe("merkelapp", () => {
  it("«Bruk» under ×1,20 er «Svakt», fra ×1,20 «Sikkert»", () => {
    const svakt = kl19([...konsept("Folka Først", 1.19), ...konsept("Sitcom", 1.19)]);
    expect(svakt?.status).toBe("bruk");
    expect(label(svakt!)).toBe("svakt");
    const sikkert = kl19([...konsept("Folka Først", 1.2), ...konsept("Sitcom", 1.2)]);
    expect(label(sikkert!)).toBe("sikkert");
  });

  it("«Test» er «Prøv»", () => {
    expect(label(kl19(konsept("Folka Først", 1.5))!)).toBe("prøv");
  });
});

describe("råd", () => {
  it("én setning per faktor", () => {
    const f = kl19([...konsept("Folka Først", 1.5), ...konsept("Sitcom", 1.5)])!;
    expect(advice(f)).toBe("Publiser Reels kl. 19–21");
    expect(advice({ ...f, platform: "youtube", format: "SHORTS", factor: "tekstlengde", level: "kort tekst" })).toBe("Bruk korte titler på Shorts");
    expect(advice({ ...f, platform: "tiktok", format: "VIDEO", factor: "varighet", level: "lang video" })).toBe("Lag lange TikTok-videoer");
    expect(advice({ ...f, factor: "ukedag", level: "søndag", concepts: ["Folka Først"] })).toBe("Publiser Folka Først på søndager");
  });
});

describe("buildMonstre", () => {
  it("rekkefølge Sikkert, Svakt, Prøv, med tallinje og detaljer", () => {
    const rows = [...konsept("Folka Først", 1.5), ...konsept("Sitcom", 1.5)];
    const [s] = buildMonstre(rows);
    expect(s.name).toBe("Instagram · Reels");
    const order = ["sikkert", "svakt", "prøv"];
    expect(s.cards.map((c) => order.indexOf(c.label))).toEqual([...s.cards.map((c) => order.indexOf(c.label))].sort());
    const c = s.cards.find((x) => x.advice === "Publiser Reels kl. 19–21");
    expect(c?.label).toBe("sikkert");
    expect(c?.numbers).toBe("1,50 ganger vanlig visningstall · 10 innlegg");
    expect(c?.details.concepts.map((x) => x.line)).toEqual([
      "1,50 ganger vanlig · 5 innlegg · 01.09",
      "1,50 ganger vanlig · 5 innlegg · 01.09",
    ]);
    expect(c?.details.note).toMatch(/vokst over tid/);
  });

  it("«Prøv» har forslag og grunn", () => {
    const c = buildMonstre(konsept("Folka Først", 1.5))[0].cards.find((x) => x.advice === "Publiser Reels kl. 19–21");
    expect(c?.label).toBe("prøv");
    expect(c?.details.suggestion).toMatch(/^Forslag: publiser noen av de neste innleggene kl. 19–21/);
    expect(c?.details.why.length).toBeGreaterThan(0);
  });

  it("ingen innlegg gir ingen seksjoner", () => {
    expect(buildMonstre([])).toEqual([]);
  });
});

describe("buildFungert", () => {
  it("bare «Sikkert», maks 3 per plattform og format", () => {
    const rows = [...konsept("Folka Først", 1.5), ...konsept("Sitcom", 1.5)];
    const sections = buildMonstre(rows);
    const many = { ...sections[0], cards: Array(5).fill(sections[0].cards[0]) };
    const svakt = { ...sections[0], id: "x", cards: [{ ...sections[0].cards[0], label: "svakt" as const }] };
    const [a, b] = buildFungert([many, svakt]);
    expect(a.lines).toHaveLength(3);
    expect(b.lines).toEqual([]);
  });
});
