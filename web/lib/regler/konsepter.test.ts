import { describe, expect, it } from "vitest";
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

  it("Folka Først fra 26.10.2026 (ny teksting)", () => {
    expect(ff).toEqual({ concept: "Folka Først", from: "2026-10-26", reason: "ny teksting" });
    expect(bruddNavn(ff)).toBe("Folka Først (fra 26.10)");
  });

  it("innlegg fra bruddatoen får eget navn, de før beholder sitt", () => {
    const rows = [
      post("instagram", "REELS", "2026-10-25T23:59:00", 1, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-26T00:00:00", 2, { concept: "Folka Først" }),
      post("instagram", "REELS", "2026-10-27T19:00:00", 3, { concept: "Sitcom" }),
    ];
    expect(delVedBrudd(rows).map((r) => r.concept)).toEqual(["Folka Først", "Folka Først (fra 26.10)", "Sitcom"]);
    expect(bruddFor("Folka Først", "2026-10-25T23:59:00")).toBeNull();
  });

  it("låsen varer 4 uker fra bruddatoen", () => {
    expect(laasPeriode(ff)).toEqual({ from: "2026-10-26", to: "2026-11-22" });
  });
});
