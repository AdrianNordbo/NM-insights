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

  it("Folka Først fra søndag 18.10.2026 (ny teksting), lås uke 43–46", () => {
    expect(ff).toEqual({ concept: "Folka Først", from: "2026-10-18", reason: "ny teksting", laas: { from: "2026-10-19", to: "2026-11-15" } });
    expect(bruddNavn(ff)).toBe("Folka Først (fra 18.10)");
  });

  it("riktig skille: lørdag 17.10 kl. 23:59 er før, søndag 18.10 kl. 00:00 er etter", () => {
    const rows = [
      post("instagram", "REELS", "2026-10-17T23:59:00", 1, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-18T00:00:00", 2, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-20T19:00:00", 3, { concept: "Sitcom" }),
    ];
    expect(delVedBrudd(rows).map((r) => r.concept)).toEqual(["Folka Først", "Folka Først (fra 18.10)", "Sitcom"]);
    expect(bruddFor("Folka Først", "2026-10-17T23:59:00")).toBeNull();
    expect(bruddFor("Folka Først", "2026-10-18T00:00:00")).toEqual(ff);
  });

  it("blandes aldri: medianen før bruddet tar ikke med innlegg etter", () => {
    const before = Array.from({ length: 6 }, (_, i) => post("instagram", "REELS", `2026-10-0${i + 1}T19:00:00`, 100, { concept: "Folka Først" }));
    const after = Array.from({ length: 6 }, (_, i) => post("instagram", "REELS", `2026-10-${18 + i}T19:00:00`, 900, { concept: "Folka Først" }));
    const s = buildConceptSummary(delVedBrudd([...before, ...after]));
    expect(s.find((r) => r.concept === "Folka Først")).toMatchObject({ posts: 6, median_views: 100 });
    expect(s.find((r) => r.concept === "Folka Først (fra 18.10)")).toMatchObject({ posts: 6, median_views: 900 });
  });

  it("den nye gruppen er foreløpig til den har 6 modne innlegg", () => {
    const mk = (n: number, mature: number) =>
      Array.from({ length: n }, (_, i) => post("instagram", "REELS", `2026-10-${String(18 + i).padStart(2, "0")}T19:00:00`, 100, { concept: "Folka Først", is_mature: i < mature }));
    const g = (rows: ReturnType<typeof mk>) => buildConceptSummary(delVedBrudd(rows)).find((r) => r.concept === "Folka Først (fra 18.10)");
    expect(g(mk(7, 5))).toMatchObject({ posts: 5, preliminary: true });
    expect(g(mk(7, 6))).toMatchObject({ posts: 6, preliminary: false });
  });

  it("låsen er uke 43–46 og slutter søndag 15.11", () => {
    expect(laasPeriode(ff)).toEqual({ from: "2026-10-19", to: "2026-11-15" });
    expect(new Date("2026-11-15T00:00:00Z").getUTCDay()).toBe(0);
  });

  it("brudd uten oppgitt lås får LAAS_UKER uker fra bruddatoen", () => {
    expect(laasPeriode({ concept: "X", from: "2026-01-05", reason: "test" })).toEqual({ from: "2026-01-05", to: "2026-02-01" });
  });
});
