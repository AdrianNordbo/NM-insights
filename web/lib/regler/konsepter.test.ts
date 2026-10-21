import { describe, expect, it } from "vitest";
import { buildConceptSummary } from "../oversikt/konseptmedianer";
import { post } from "../oversikt/testdata";
import { bruddFor, bruddNavn, delVedBrudd, IKKE_ANALYSE, KONSEPTBRUDD, laasPeriode, utenUtelatte } from "./konsepter";

describe("utelatte konsepter", () => {
  it("Bankinfo fjernes, alt annet beholdes", () => {
    const rows = [post("instagram", "FEED", "2026-10-01T12:00:00", 1, { concept: "Bankinfo" }), post("instagram", "REELS", "2026-10-01T19:00:00", 2)];
    expect(utenUtelatte(rows).map((r) => r.concept)).toEqual(["Sitcom"]);
  });

  it("analysen utelater både samlekategorier og Bankinfo", () => {
    expect([...IKKE_ANALYSE].sort()).toEqual(["Annet/aktualitet", "Bankinfo", "Før konsepter", "Ukjent"]);
  });
});

describe("konseptbrudd", () => {
  const ff = KONSEPTBRUDD[0];

  it("Folka Først fra mandag 19.10.2026 (ny teksting)", () => {
    expect(ff).toEqual({ concept: "Folka Først", from: "2026-10-19", reason: "ny teksting" });
    expect(bruddNavn(ff)).toBe("Folka Først (fra 19.10)");
  });

  it("riktig ukeskifte: søndag 18.10 kl. 23:59 er før, mandag 19.10 kl. 00:00 er etter", () => {
    const rows = [
      post("instagram", "REELS", "2026-10-18T23:59:00", 1, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-19T00:00:00", 2, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-20T19:00:00", 3, { concept: "Sitcom" }),
    ];
    expect(delVedBrudd(rows).map((r) => r.concept)).toEqual(["Folka Først", "Folka Først (fra 19.10)", "Sitcom"]);
    expect(bruddFor("Folka Først", "2026-10-18T23:59:00")).toBeNull();
    expect(bruddFor("Folka Først", "2026-10-19T00:00:00")).toEqual(ff);
  });

  it("blandes aldri: medianen før bruddet tar ikke med innlegg etter", () => {
    const before = Array.from({ length: 6 }, (_, i) => post("instagram", "REELS", `2026-10-0${i + 1}T19:00:00`, 100, { concept: "Folka Først" }));
    const after = Array.from({ length: 6 }, (_, i) => post("instagram", "REELS", `2026-10-2${i}T19:00:00`, 900, { concept: "Folka Først" }));
    const s = buildConceptSummary(delVedBrudd([...before, ...after]));
    expect(s.find((r) => r.concept === "Folka Først")).toMatchObject({ posts: 6, median_views: 100 });
    expect(s.find((r) => r.concept === "Folka Først (fra 19.10)")).toMatchObject({ posts: 6, median_views: 900 });
  });

  it("den nye gruppen er foreløpig til den har 6 modne innlegg", () => {
    const mk = (n: number, mature: number) =>
      Array.from({ length: n }, (_, i) => post("instagram", "REELS", `2026-10-${String(19 + i).padStart(2, "0")}T19:00:00`, 100, { concept: "Folka Først", is_mature: i < mature }));
    const g = (rows: ReturnType<typeof mk>) => buildConceptSummary(delVedBrudd(rows)).find((r) => r.concept === "Folka Først (fra 19.10)");
    expect(g(mk(7, 5))).toMatchObject({ posts: 5, preliminary: true });
    expect(g(mk(7, 6))).toMatchObject({ posts: 6, preliminary: false });
  });

  it("låsen varer 4 uker fra bruddatoen: 19.10–15.11", () => {
    expect(laasPeriode(ff)).toEqual({ from: "2026-10-19", to: "2026-11-15" });
  });
});
