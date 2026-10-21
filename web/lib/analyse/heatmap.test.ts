import { describe, expect, it } from "vitest";
import { post } from "../oversikt/testdata";
import { blokkFor, buildHeat, dataCeller, HEAT_MIN_N, heatGrunnlag, osloParts } from "./heatmap";

// 13.10.2026 er en tirsdag, 15.10 torsdag.
const sitcom = (date: string, views: number, extra = {}) => post("instagram", "REELS", `${date}T19:05:00`, views, { concept: "Sitcom", ...extra });

describe("tid", () => {
  it("ukedag og tidsblokk fra lokal Oslo-tid", () => {
    expect(osloParts("2026-10-13T19:05:00")).toEqual({ weekday: 1, hour: 19, hm: "19:05" });
    expect([5, 6, 11, 16, 19, 20, 23].map(blokkFor)).toEqual([-1, 0, 1, 2, 2, 3, 3]);
  });
});

describe("grunnlag", () => {
  it("bare modne innlegg, uten hendelse, Bankinfo og samlekategorier; Folka Først delt ved 19.10", () => {
    const rows = [
      sitcom("2026-10-13", 100),
      sitcom("2026-10-13", 100, { is_mature: false }),
      sitcom("2026-10-13", 100, { special_event: "VM 2026" }),
      sitcom("2026-10-13", 100, { concept: "Bankinfo" }),
      sitcom("2026-10-13", 100, { concept: "Før konsepter" }),
      post("instagram", "REELS", "2026-10-27T19:00:00", 100, { concept: "Folka Først" }),
    ];
    expect(heatGrunnlag(rows).map((r) => r.concept)).toEqual(["Sitcom", "Folka Først (fra 19.10)"]);
  });
});

describe("buildHeat", () => {
  const rows = [
    sitcom("2026-10-13", 100),
    sitcom("2026-10-06", 200),
    sitcom("2026-09-29", 300),
    sitcom("2026-10-15", 400), // torsdag, alene i cellen
    post("instagram", "REELS", "2026-10-12T19:00:00", 50, { concept: "Folka Først" }),
  ];
  const h = buildHeat(rows, "instagram", "REELS");

  it("verdien er median av visninger delt på konseptets median", () => {
    // Sitcom-median = 250 → 0,4 / 0,8 / 1,2 tirsdag 16–20
    expect(h.conceptMedian.Sitcom).toBe(250);
    expect(h.grids.Sitcom[1][2]).toEqual({ n: 3, median: 0.8, time: "19:05" });
    expect(h.grids.alle[1][2].n).toBe(3);
  });

  it("antall i alle celler, også de med for få innlegg", () => {
    expect(h.grids.Sitcom[3][2].n).toBe(1);
    expect(h.grids.alle[5][0]).toEqual({ n: 0, median: null, time: null });
  });

  it(`celler med data krever minst ${HEAT_MIN_N} innlegg`, () => {
    expect(dataCeller(h, "Sitcom")).toEqual([{ weekday: 1, block: 2, n: 3, median: 0.8, time: "19:05" }]);
    expect(dataCeller(h, "Folka Først")).toEqual([]);
    expect(dataCeller(undefined, "Sitcom")).toEqual([]);
  });

  it("andre plattformer og formater blandes ikke inn", () => {
    expect(buildHeat(rows, "tiktok", "VIDEO").n).toBe(0);
  });
});
