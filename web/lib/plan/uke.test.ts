import { describe, expect, it } from "vitest";
import { gyldigUke, isoUke, kommendeUker, lesUke, mandag, ukeDager, ukeKey, ukeLabel, ukerIAar } from "./uke";

describe("ISO-uker", () => {
  it("ukeskifte: søndag hører til uken før mandag", () => {
    expect(isoUke("2026-10-18")).toEqual({ aar: 2026, uke: 42 });
    expect(isoUke("2026-10-19")).toEqual({ aar: 2026, uke: 43 });
  });

  it("årsskifte: 2026 har 53 uker, og 28.12.2026–03.01.2027 er uke 53 i 2026", () => {
    expect(ukerIAar(2026)).toBe(53);
    expect(ukerIAar(2027)).toBe(52);
    expect(isoUke("2027-01-03")).toEqual({ aar: 2026, uke: 53 });
    expect(isoUke("2027-01-04")).toEqual({ aar: 2027, uke: 1 });
    expect(ukeDager({ aar: 2026, uke: 53 })).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(isoUke("2025-12-29")).toEqual({ aar: 2026, uke: 1 });
  });

  it("mandag, nøkkel og lesing", () => {
    expect(mandag({ aar: 2026, uke: 45 })).toBe("2026-11-02");
    expect(ukeKey({ aar: 2026, uke: 5 })).toBe("2026-W05");
    expect(lesUke("2026-W45")).toEqual({ aar: 2026, uke: 45 });
    expect(lesUke("2027-W53")).toBeNull();
    expect(lesUke("x")).toBeNull();
    expect(gyldigUke({ aar: 2026, uke: 53 })).toBe(true);
  });

  it("etikett og kommende uker over årsskiftet", () => {
    expect(ukeLabel({ aar: 2026, uke: 45 }, "2026-10-21")).toBe("Uke 45 · 02.11–08.11");
    expect(ukeLabel({ aar: 2026, uke: 53 }, "2026-10-21")).toBe("Uke 53 2026 · 28.12–03.01");
    expect(kommendeUker("2026-12-20", 3).map(ukeKey)).toEqual(["2026-W51", "2026-W52", "2026-W53"]);
    expect(kommendeUker("2026-12-28", 2).map(ukeKey)).toEqual(["2026-W53", "2027-W01"]);
  });
});
