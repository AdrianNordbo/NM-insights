import { describe, expect, it } from "vitest";
import type { ConceptSummaryRow, ContentLatestRow, Format, Platform } from "../data/types";
import { buildRecommendations, conceptLabel } from "./anbefalinger";
import { addDays } from "../format";
import { post } from "./testdata";

const TODAY = "2026-10-02";

function summary(
  concept: string,
  posts: number,
  median: number,
  engagement: number,
  extra: Partial<ConceptSummaryRow> = {},
): ConceptSummaryRow {
  return {
    platform: "instagram", account_id: 1, format: "REELS", concept, special_event: null, posts,
    median_views: median, median_likes: 1, median_comments: 0, preliminary: posts < 6,
    median_engagement_per_view: engagement, ...extra,
  };
}

/** Modne innlegg i konseptet, ett per dag bakover fra `lastDay`, med gitte visninger (eldst først). */
function series(concept: string, lastDay: string, views: number[], platform: Platform = "instagram", format: Format = "REELS"): ContentLatestRow[] {
  return views.map((v, i) => {
    const day = addDays(lastDay, i - views.length + 1);
    const age = Math.max(7, Math.round((Date.parse(TODAY) - Date.parse(day)) / 86_400_000));
    return post(platform, format, `${day}T19:00:00`, v, { concept, age_days: age, is_mature: true });
  });
}

const reels = (line: ReturnType<typeof buildRecommendations>) => line.blocks.find((b) => b.format === "REELS")!;

describe("hvem som er med", () => {
  const base = [summary("Sitcom", 15, 800, 0.019), summary("Folka Først", 44, 650, 0.009)];
  const content = [...series("Sitcom", "2026-09-29", [700, 700, 700]), ...series("Folka Først", "2026-09-28", [650, 650, 650])];

  it("inaktive (21 dager), foreløpige, spesielle hendelser og utelatte konsepter gir aldri anbefaling", () => {
    const rows = [
      ...base,
      summary("Uten kompetanse", 14, 5000, 0.5), // inaktiv: siste innlegg 21 dager siden
      summary("Annet/aktualitet", 9, 30000, 0.9, { special_event: "VM 2026" }),
      summary("Bankinfo", 8, 9000, 0.9),
      summary("Før konsepter", 30, 9000, 0.9),
      summary("Nytt", 2, 9000, 0.9), // foreløpig
    ];
    const extra = [
      ...series("Uten kompetanse", "2026-09-11", [5000, 5000, 5000]),
      ...series("Bankinfo", "2026-09-30", [9000, 9000, 9000]),
      ...series("Før konsepter", "2026-06-10", [9000]),
      ...series("Nytt", "2026-09-30", [9000]),
    ];
    const text = reels(buildRecommendations(rows, [...content, ...extra], TODAY, false)).recommendation?.text ?? "";
    expect(text).toBe("Sitcom leder både på visninger og engasjement.");
  });

  it("aktiv med 20 dager siden siste innlegg, inaktiv med 21", () => {
    const rows = [...base, summary("Uten kompetanse", 14, 5000, 0.5)];
    const at = (last: string) =>
      reels(buildRecommendations(rows, [...content, ...series("Uten kompetanse", last, [5000, 5000, 5000])], TODAY, false)).recommendation?.text;
    expect(at("2026-09-12")).toBe("Uten kompetanse (siste innlegg 12.09) leder både på visninger og engasjement.");
    expect(at("2026-09-11")).toBe("Sitcom leder både på visninger og engasjement.");
  });

  it("konsepter som snart blir inaktive merkes med siste innleggsdato", () => {
    expect(conceptLabel("Uten kompetanse", "2026-09-17T19:00:00", TODAY)).toBe("Uten kompetanse (siste innlegg 17.09)");
    expect(conceptLabel("Sitcom", "2026-09-29T19:00:00", TODAY)).toBe("Sitcom");
    expect(conceptLabel("Sitcom", "2026-09-19T19:00:00", TODAY)).toBe("Sitcom"); // 13 dager
    expect(conceptLabel("Sitcom", "2026-09-18T19:00:00", TODAY)).toBe("Sitcom (siste innlegg 18.09)"); // 14 dager
  });
});

describe("regel A: ferskt toppinnlegg", () => {
  const rows = [summary("Sitcom", 15, 1000, 0.019)];
  const old = series("Sitcom", "2026-09-10", [1000, 1000, 1000]);
  const fresh = (views: number, age: number) =>
    post("instagram", "REELS", `${addDays(TODAY, -age)}T19:00:00`, views, { concept: "Sitcom", age_days: age + 0.3, title: "Fersk\nmer tekst" });

  it("1,50 × treffer, 1,49 × treffer ikke", () => {
    expect(reels(buildRecommendations(rows, [...old, fresh(1500, 10)], TODAY, false)).recommendation).toMatchObject({
      kind: "A",
      text: "«Fersk» (22.09) fikk ×1,5 av vanlig for Sitcom.",
    });
    expect(reels(buildRecommendations(rows, [...old, fresh(1490, 10)], TODAY, false)).recommendation).toBeNull();
  });

  it("bare innlegg som er 7–14 dager gamle", () => {
    const kind = (age: number) => reels(buildRecommendations(rows, [...old, fresh(3000, age)], TODAY, false)).recommendation?.kind;
    expect(kind(6)).toBeUndefined();
    expect(kind(7)).toBe("A");
    expect(kind(14)).toBe("A");
    expect(kind(15)).toBeUndefined();
  });
});

describe("regel B og B2", () => {
  const content = [...series("Sitcom", "2026-09-29", [700, 700, 700]), ...series("Folka Først", "2026-09-28", [650, 650, 650])];

  it("samme leder gir B, ulike ledere gir B2", () => {
    const b = buildRecommendations([summary("Sitcom", 15, 800, 0.02), summary("Folka Først", 44, 650, 0.009)], content, TODAY, false);
    expect(reels(b).recommendation).toMatchObject({ kind: "B", text: "Sitcom leder både på visninger og engasjement." });
    const b2 = buildRecommendations([summary("Sitcom", 15, 600, 0.02), summary("Folka Først", 44, 800, 0.009)], content, TODAY, false);
    expect(reels(b2).recommendation).toMatchObject({ kind: "B2", text: "Folka Først når flest, Sitcom engasjerer best." });
  });

  it("lederen må ligge minst 10 % over nummer to", () => {
    const close = buildRecommendations([summary("Sitcom", 15, 709, 0.02), summary("Folka Først", 44, 650, 0.009)], content, TODAY, false);
    expect(reels(close).recommendation).toBeNull(); // 709 er 9 % over 650
    const clear = buildRecommendations([summary("Sitcom", 15, 715, 0.02), summary("Folka Først", 44, 650, 0.009)], content, TODAY, false);
    expect(reels(clear).recommendation?.kind).toBe("B"); // 715 er 10 % over
  });

  it("ett godkjent konsept gir ingen B", () => {
    expect(reels(buildRecommendations([summary("Sitcom", 15, 800, 0.02)], content, TODAY, false)).recommendation).toBeNull();
  });

  it("info-teksten viser tallene", () => {
    const b2 = buildRecommendations([summary("Sitcom", 15, 600, 0.019), summary("Folka Først", 44, 800, 0.009)], content, TODAY, false);
    const details = reels(b2).recommendation!.details;
    expect(details).toContain("Sitcom: median 600 visninger, 1,9 % engasjement per visning (15 innlegg)");
    expect(details).toContain("Sammenligner bare Instagram Reels med Instagram Reels");
  });
});

describe("regel C: svak trend", () => {
  const rows = [summary("Sitcom", 15, 900, 0.02), summary("Folka Først", 44, 600, 0.009)];

  it("tre siste under ⅔ av medianen treffer, ett over treffer ikke", () => {
    const weak = [...series("Sitcom", "2026-09-29", [900, 500, 550, 590]), ...series("Folka Først", "2026-09-28", [600, 600, 600])];
    expect(reels(buildRecommendations(rows, weak, TODAY, false)).recommendation).toMatchObject({
      kind: "C",
      text: "De tre siste Sitcom-innleggene lå under ⅔ av vanlig.",
    });
    const ok = [...series("Sitcom", "2026-09-29", [900, 500, 550, 600]), ...series("Folka Først", "2026-09-28", [600, 600, 600])];
    expect(reels(buildRecommendations(rows, ok, TODAY, false)).recommendation?.kind).not.toBe("C"); // 600 = ⅔ av 900
  });

  it("færre enn tre modne innlegg gir ingen C", () => {
    const two = [...series("Sitcom", "2026-09-29", [100, 100]), ...series("Folka Først", "2026-09-28", [600, 600, 600])];
    expect(reels(buildRecommendations(rows, two, TODAY, false)).recommendation?.kind).not.toBe("C");
  });

  it("C går foran A i samme blokk", () => {
    const content = [
      ...series("Sitcom", "2026-09-29", [500, 550, 590]),
      ...series("Folka Først", "2026-09-28", [600, 600, 600]),
      post("instagram", "REELS", "2026-09-22T19:00:00", 5000, { concept: "Folka Først", age_days: 10 }),
    ];
    expect(reels(buildRecommendations(rows, content, TODAY, false)).recommendation?.kind).toBe("C");
  });
});

describe("lovende og nye konsepter", () => {
  const rows = [summary("Sitcom", 15, 800, 0.019), summary("Folka Først", 44, 650, 0.009)];
  const content = [...series("Sitcom", "2026-09-29", [800, 800, 800]), ...series("Folka Først", "2026-09-28", [650, 650, 650])];

  it("lovende når medianen er minst like høy som beste godkjente konsept, ellers nytt konsept", () => {
    const high = buildRecommendations([...rows, summary("På Gata", 1, 33329, 0.0007)], [...content, ...series("På Gata", "2026-09-24", [33329])], TODAY, false);
    expect(reels(high).promising?.text).toBe("På Gata: lovende, men for tidlig å si (1 innlegg).");
    const low = buildRecommendations([...rows, summary("På Gata", 1, 300, 0.0007)], [...content, ...series("På Gata", "2026-09-24", [300])], TODAY, false);
    expect(reels(low).promising?.text).toBe("På Gata: nytt konsept, for tidlig å si (1 innlegg).");
  });

  it("lovende rangeres ikke og teller ikke i makstallet", () => {
    const line = buildRecommendations([...rows, summary("På Gata", 1, 33329, 0.0007)], [...content, ...series("På Gata", "2026-09-24", [33329])], TODAY, false);
    expect(reels(line).recommendation?.text).toBe("Sitcom leder både på visninger og engasjement.");
    expect(reels(line).recommendation?.text).not.toContain("På Gata");
  });
});

describe("hele linjen", () => {
  it("aldri på tvers av plattformer: én blokk per plattform og format, og Feed bare med bryteren på", () => {
    const rows = [
      summary("Sitcom", 15, 700, 0.019),
      summary("Folka Først", 44, 650, 0.009),
      summary("Sitcom", 15, 131, 0.009, { platform: "youtube", format: "SHORTS" }),
      summary("Folka Først", 44, 84, 0.0036, { platform: "youtube", format: "SHORTS" }),
      summary("CTF", 28, 242, 0.007, { format: "FEED" }),
    ];
    const content = [
      ...series("Sitcom", "2026-09-29", [700, 700, 700]),
      ...series("Folka Først", "2026-09-28", [650, 650, 650]),
      ...series("Sitcom", "2026-09-29", [131, 131, 131], "youtube", "SHORTS"),
      ...series("Folka Først", "2026-09-28", [84, 84, 84], "youtube", "SHORTS"),
      ...series("CTF", "2026-09-08", [242, 242, 242], "instagram", "FEED"),
    ];
    const off = buildRecommendations(rows, content, TODAY, false);
    expect(off.blocks.map((b) => b.id)).toEqual(["instagram-REELS", "youtube-SHORTS"]);
    expect(off.blocks[1].recommendation?.text).toBe("Sitcom leder både på visninger og engasjement.");
    const on = buildRecommendations(rows, content, TODAY, true);
    expect(on.blocks.map((b) => b.id)).toEqual(["instagram-REELS", "instagram-FEED", "youtube-SHORTS"]);
    expect(on.blocks[1].recommendation).toBeNull(); // CTF er inaktiv
  });

  it("«Ingen tydelige signaler» når ingenting treffer", () => {
    const line = buildRecommendations([summary("Sitcom", 15, 700, 0.019)], series("Sitcom", "2026-09-29", [700, 700, 700]), TODAY, false);
    expect(line.empty).toBe(true);
  });

  it("dagens situasjon: B2 for Reels, med siste innleggsdato for Uten kompetanse og På Gata som lovende", () => {
    const rows = [
      summary("Uten kompetanse", 14, 1370, 0.0131),
      summary("Sitcom", 15, 688, 0.0191),
      summary("Folka Først", 44, 652, 0.009),
      summary("På Gata", 1, 33329, 0.0007),
      summary("Bankinfo", 1, 213, 0.0376),
    ];
    const content = [
      ...series("Uten kompetanse", "2026-09-17", [4774, 5828, 1935]),
      ...series("Sitcom", "2026-09-29", [448, 688, 545]),
      ...series("Folka Først", "2026-09-28", [299, 365, 775]),
      ...series("På Gata", "2026-09-24", [33329]),
    ];
    const block = reels(buildRecommendations(rows, content, TODAY, false));
    expect(block.recommendation?.text).toBe("Uten kompetanse (siste innlegg 17.09) når flest, Sitcom engasjerer best.");
    expect(block.promising?.text).toBe("På Gata: lovende, men for tidlig å si (1 innlegg).");
  });
});
