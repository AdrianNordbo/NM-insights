import { describe, expect, it } from "vitest";
import { buildSeries } from "./aktivitet";
import { periodOf } from "./periode";
import { eventWord, joinNo, summarySentence } from "./sammendrag";
import { days, post } from "./testdata";

const MINUS = "−"; // nb-NO bruker ekte minustegn
const NBSP = " "; // og hardt mellomrom før %

describe("sammendragssetninger", () => {
  it("flere visninger med prosent, men lavere engasjement", () => {
    const [s] = buildSeries([
      ...days("instagram", "REELS", "2026-09-14", "2026-09-20", 1000, "2026-09-27", { likes: 5, shares: 3, saves: 2, comments: 1 }),
      ...days("instagram", "REELS", "2026-09-21", "2026-09-27", 1220, "2026-09-27", { likes: 4, shares: 1, saves: 1, comments: 0 }),
    ]);
    expect(summarySentence(s, periodOf("uke", "2026-09-21"), [])).toBe(
      `Flere visninger enn uke 38 (+22${NBSP}%), men lavere engasjement: likes, kommentarer, delinger og lagringer ned.`,
    );
  });

  it("viser tallene i stedet for prosent når forrige verdi er under 1 000", () => {
    const [s] = buildSeries([
      ...days("youtube", "SHORTS", "2026-09-14", "2026-09-20", 100, "2026-09-27", { likes: 0 }),
      ...days("youtube", "SHORTS", "2026-09-21", "2026-09-27", 120, "2026-09-27", { likes: 1 }),
    ]);
    expect(summarySentence(s, periodOf("uke", "2026-09-21"), [])).toBe(
      "Flere visninger enn uke 38 (840 mot 700), og mer engasjement: likes opp.",
    );
  });

  it("færre visninger, men mer engasjement, og lagringer nevnes aldri for YouTube", () => {
    const [s] = buildSeries([
      ...days("youtube", "SHORTS", "2026-09-14", "2026-09-20", 1000, "2026-09-27", { likes: 1 }),
      ...days("youtube", "SHORTS", "2026-09-21", "2026-09-27", 500, "2026-09-27", { likes: 2, shares: 3, comments: 1 }),
    ]);
    const text = summarySentence(s, periodOf("uke", "2026-09-21"), [])!;
    expect(text).toBe(`Færre visninger enn uke 38 (${MINUS}50${NBSP}%), men mer engasjement: likes, kommentarer og delinger opp.`);
    expect(text).not.toContain("lagringer");
  });

  it("blandet engasjement og uendret engasjement", () => {
    const [mixed] = buildSeries([
      ...days("instagram", "REELS", "2026-09-14", "2026-09-20", 10, "2026-09-27", { likes: 1, shares: 5 }),
      ...days("instagram", "REELS", "2026-09-21", "2026-09-27", 10, "2026-09-27", { likes: 2, shares: 1 }),
    ]);
    expect(summarySentence(mixed, periodOf("uke", "2026-09-21"), [])).toBe("Like mange visninger som uke 38. Likes opp, delinger ned.");
    const [same] = buildSeries(days("instagram", "REELS", "2026-09-14", "2026-09-27", 10, "2026-09-27"));
    expect(summarySentence(same, periodOf("uke", "2026-09-21"), [])).toBe("Like mange visninger som uke 38. Engasjementet er uendret.");
  });

  it("uferdig periode: «Hittil» og like mange dager i forrige periode", () => {
    const [s] = buildSeries(days("instagram", "REELS", "2026-09-14", "2026-09-30", 2000, "2026-09-30"));
    expect(summarySentence(s, periodOf("uke", "2026-09-28"), [])).toBe(
      "Hittil like mange visninger som uke 39, 21.–23.09. Engasjementet er uendret.",
    );
  });

  it("VM-innhold i forrige periode gjør sammenligningen skjev", () => {
    const [s] = buildSeries(days("instagram", "REELS", "2026-06-01", "2026-08-31", 1000, "2026-08-31"));
    const content = [post("instagram", "REELS", "2026-07-04T19:00:00", 90000, { special_event: "VM 2026" })];
    expect(summarySentence(s, periodOf("måned", "2026-08-01"), content)).toBe(
      "Like mange visninger som juli. Engasjementet er uendret. Juli inneholdt VM-innhold, så sammenligningen er skjev.",
    );
  });

  it("VM-innhold i begge periodene, og bare på riktig plattform og format", () => {
    const [s] = buildSeries(days("instagram", "REELS", "2026-06-01", "2026-07-31", 1000, "2026-07-31"));
    const content = [
      post("instagram", "REELS", "2026-06-20T19:00:00", 1, { special_event: "VM 2026" }),
      post("instagram", "REELS", "2026-07-04T19:00:00", 1, { special_event: "VM 2026" }),
      post("youtube", "SHORTS", "2026-05-20T19:00:00", 1, { special_event: "Annet 2026" }),
    ];
    expect(summarySentence(s, periodOf("måned", "2026-07-01"), content)).toContain(
      "Både juni og juli inneholdt VM-innhold, så sammenligningen er skjev.",
    );
    expect(summarySentence(s, periodOf("måned", "2026-06-01"), content)).not.toContain("Annet");
  });

  it("ingen sammenligning når forrige periode mangler data, og ingen setning før første data", () => {
    const [s] = buildSeries(days("youtube", "SHORTS", "2026-06-15", "2026-06-30", 10, "2026-06-30"));
    expect(summarySentence(s, periodOf("måned", "2026-06-01"), [])).toBe(
      "Ingen sammenligning: plattformen har ikke data for mai.",
    );
    expect(summarySentence(s, periodOf("måned", "2026-05-01"), [])).toBeNull();
  });

  it("hjelpere", () => {
    expect(joinNo(["a"])).toBe("a");
    expect(joinNo(["a", "b", "c"])).toBe("a, b og c");
    expect(eventWord("VM 2026")).toBe("VM-innhold");
    expect(eventWord("Black Friday")).toBe("Black Friday-innhold");
  });
});
