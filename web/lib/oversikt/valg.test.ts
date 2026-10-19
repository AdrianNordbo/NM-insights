import { describe, expect, it } from "vitest";
import { plattformValg } from "../regler/plattformer";
import { forrigeOmraade, lesValg, omraade, periodeValg, perioder, valgHref } from "./valg";

const TODAY = "2026-10-19"; // mandag

describe("standardvalg", () => {
  it("Alle og Total når adressen er tom eller ugyldig", () => {
    const v = lesValg({}, TODAY);
    expect(v.plattform.key).toBe("alle");
    expect(v.periode.key).toBe("total");
    expect(lesValg({ plattform: "facebook", periode: "x" }, TODAY).periode.key).toBe("total");
  });

  it("adressen viser valget", () => {
    expect(valgHref("/", { plattform: "alle", periode: "total" })).toBe("/?plattform=alle&periode=total");
  });

  it("Alle tar ikke med Feed i lister, men i totaltallet", () => {
    const alle = plattformValg("alle");
    expect(alle.formats.instagram).toEqual(["REELS"]);
    expect(alle.totalFormats.instagram).toEqual(["REELS", "FEED"]);
    expect(plattformValg("instagram-feed").formats).toEqual({ instagram: ["FEED"] });
  });
});

describe("perioder", () => {
  it("kalenderperioder i Oslo-kalenderen", () => {
    const p = Object.fromEntries(perioder(TODAY).map((x) => [x.key, x]));
    expect(p["denne-uken"]).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
    expect(p["forrige-uke"]).toMatchObject({ start: "2026-10-12", end: "2026-10-18" });
    expect(p["denne-maaneden"]).toMatchObject({ start: "2026-10-01", end: "2026-10-31", label: "Denne måneden (oktober)" });
    expect(p["forrige-maaned"]).toMatchObject({ start: "2026-09-01", end: "2026-09-30", label: "Forrige måned (september)" });
    expect(perioder("2026-01-05").find((x) => x.key === "forrige-maaned")).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("kalenderperiode kuttes ved siste døgn; ingen data gir has = false", () => {
    expect(omraade(periodeValg("forrige-uke", TODAY), "2026-10-16", "2026-06-15")).toMatchObject({ start: "2026-10-12", end: "2026-10-16", days: 5, has: true });
    expect(omraade(periodeValg("denne-uken", TODAY), "2026-10-16", "2026-06-15")).toMatchObject({ has: false, days: 0 });
  });

  it("rullerende perioder slutter på siste døgn med data", () => {
    expect(omraade(periodeValg("siste-7", TODAY), "2026-10-18", "2026-06-15")).toMatchObject({ start: "2026-10-12", end: "2026-10-18", days: 7 });
  });

  it("Total fra startdatoen", () => {
    expect(omraade(periodeValg("total", TODAY), "2026-10-18", "2026-06-15")).toMatchObject({ start: "2026-06-15", label: "siden 15.06" });
  });

  it("sammenligning mot like mange dager rett før", () => {
    const o = omraade(periodeValg("forrige-uke", TODAY), "2026-10-16", "2026-06-15");
    expect(forrigeOmraade(o)).toEqual({ start: "2026-10-07", end: "2026-10-11", label: "07.10–11.10 (5 dager før)" });
  });
});
