import { describe, expect, it } from "vitest";
import { type HeatGrid, type HeatSection, TIDSBLOKKER } from "../analyse/heatmap";
import { post } from "../oversikt/testdata";
import { PLAN_PLATTFORMER } from "../regler/plattformer";
import { eksempel, finnInnlegg, folgOpp } from "./oppfolging";
import { type KoVideo, lagUtkast, type Regler, round5, ukedag, utkastCsv } from "./utkast";

const TODAY = "2026-10-19"; // mandag
type Cell = { concept: string; wd: number; block: number; n: number; median?: number; time?: string };

function section(platform: "instagram" | "youtube" | "tiktok", format: "REELS" | "SHORTS" | "VIDEO", cells: Cell[], medians: Record<string, number> = {}): HeatSection {
  const empty = (): HeatGrid => Array.from({ length: 7 }, () => TIDSBLOKKER.map(() => ({ n: 0, median: null, time: null })));
  const grids: Record<string, HeatGrid> = { alle: empty() };
  for (const c of cells) {
    grids[c.concept] ??= empty();
    grids[c.concept][c.wd][c.block] = { n: c.n, median: c.median ?? 1, time: c.time ?? "19:00" };
  }
  const concepts = Object.keys(grids).filter((k) => k !== "alle");
  return { platform, format, n: 0, concepts, conceptPosts: {}, conceptMedian: medians, grids };
}

// Sitcom: tirsdag 16–20 på alle tre. Folka Først: mandag og onsdag 16–20 (flest på mandag). På Gata: ingen data.
const cells: Cell[] = [
  { concept: "Sitcom", wd: 1, block: 2, n: 11, median: 1.37, time: "19:01" },
  { concept: "Folka Først", wd: 0, block: 2, n: 11, median: 0.9, time: "18:58" },
  { concept: "Folka Først", wd: 2, block: 2, n: 11, median: 2.2, time: "18:01" },
  { concept: "Folka Først", wd: 6, block: 3, n: 4, median: 1.4, time: "20:01" },
];
const heat = {
  instagram: section("instagram", "REELS", cells, { Sitcom: 700, "Folka Først": 640 }),
  youtube: section("youtube", "SHORTS", cells),
  tiktok: section("tiktok", "VIDEO", cells.filter((c) => c.concept !== "Folka Først" || c.wd === 0)),
};
const regler = (over: Partial<Regler> = {}): Regler => ({ start: "2026-10-20", horizon: 14, maxPerDay: 1, gapHours: 3, testsPerWeek: 0, ...over });
const v = (id: string, concept: string, platforms = ["instagram"]): KoVideo => ({ id, title: `${concept} ${id}`, concept, platforms });

describe("grunnregler", () => {
  it("velger bare dag og klokkeslett; alle videoene i køen plasseres i køens rekkefølge", () => {
    const u = lagUtkast([v("1", "Sitcom"), v("2", "Sitcom")], regler(), heat, TODAY);
    expect(u.placed.map((p) => [p.date, p.time, p.kind])).toEqual([
      ["2026-10-20", "19:00", "Basert på data"],
      ["2026-10-27", "19:00", "Basert på data"],
    ]);
    expect(round5("19:01")).toBe("19:00");
  });

  it("starter tidligst i morgen", () => {
    expect(lagUtkast([v("1", "Sitcom")], regler({ start: "2026-10-01" }), heat, TODAY).days[0]).toBe("2026-10-20");
  });

  it("maks per dag og én video per type innhold og dag gjelder per plattform", () => {
    const u = lagUtkast([v("1", "Sitcom"), v("2", "Sitcom")], regler({ maxPerDay: 3, horizon: 7 }), heat, TODAY);
    expect(u.placed).toHaveLength(1);
    expect(u.unplaced.map((x) => x.reason)).toEqual(["ingen ledig plass i tidsrommene med tall i perioden"]);
  });
});

describe("flere plattformer per video", () => {
  it("én plassering per plattform, samme dag der det er mulig", () => {
    const u = lagUtkast([v("1", "Sitcom", ["instagram", "tiktok", "youtube"])], regler(), heat, TODAY);
    expect(u.placed.map((p) => [p.platform, p.date])).toEqual([
      ["instagram", "2026-10-20"],
      ["tiktok", "2026-10-20"],
      ["youtube", "2026-10-20"],
    ]);
  });

  it("plattformene planlegges etter egne tall: uten tall den dagen får plattformen sin egen dag", () => {
    // Folka Først på TikTok har bare mandag; Instagram får onsdag (høyest), TikTok mandag uka etter
    const u = lagUtkast([v("1", "Folka Først", ["instagram", "tiktok"])], regler({ start: "2026-10-20" }), heat, TODAY);
    const ig = u.placed.find((p) => p.platform === "instagram")!;
    const tt = u.placed.find((p) => p.platform === "tiktok")!;
    expect(ukedag(ig.date)).toBe(2);
    expect(ukedag(tt.date)).toBe(0);
  });

  it("maks per dag og mellomrom gjelder per plattform, ikke på tvers", () => {
    const u = lagUtkast([v("1", "Sitcom", ["instagram", "youtube"])], regler({ maxPerDay: 1 }), heat, TODAY);
    expect(u.placed.filter((p) => p.date === "2026-10-20")).toHaveLength(2);
  });
});

describe("tester", () => {
  it("test i et kveldstidsrom uten tall samme ukedag; maks per plattform og uke", () => {
    const u = lagUtkast([v("1", "Sitcom"), v("2", "Sitcom")], regler({ testsPerWeek: 1 }), heat, TODAY);
    const [a, b] = u.placed;
    expect(a).toMatchObject({ date: "2026-10-20", time: "21:00", kind: "Test", followUp: "2026-10-27", block: 3 });
    expect(b).toMatchObject({ date: "2026-10-27", kind: "Test" });
  });

  it("aldri mer enn 2 tester per plattform og uke, selv om mer er valgt", () => {
    const q = ["a", "b", "c", "d"].map((id) => v(id, "På Gata"));
    // 20.–25.10 er én kalenderuke
    const u = lagUtkast(q, regler({ testsPerWeek: 5, maxPerDay: 1, horizon: 6 }), heat, TODAY);
    expect(u.placed.filter((p) => p.kind === "Test")).toHaveLength(2);
    expect(u.unplaced).toHaveLength(2);
    expect(u.unplaced[0].reason).toBe("ingen tidsrom med tall for typen innhold, og ingen plass til flere tester");
  });

  it("type innhold uten tall får bare test, og ingen plassering når tester er slått av", () => {
    expect(lagUtkast([v("1", "På Gata")], regler({ testsPerWeek: 1 }), heat, TODAY).placed[0].kind).toBe("Test");
    expect(lagUtkast([v("1", "På Gata")], regler({ testsPerWeek: 0 }), heat, TODAY).placed).toHaveLength(0);
  });
});

describe("Folka Først-låsen (26.10–22.11)", () => {
  it("fast tidspunkt på alle plattformer, aldri test", () => {
    const q = [v("1", "Folka Først", ["instagram", "youtube", "tiktok"]), v("2", "Folka Først", ["instagram", "youtube", "tiktok"])];
    const u = lagUtkast(q, regler({ start: "2026-10-26", testsPerWeek: 2 }), heat, TODAY);
    expect(u.placed.every((p) => p.kind === "Basert på data")).toBe(true);
    expect(u.placed.every((p) => p.why.startsWith("Fast tidspunkt for Folka Først på alle plattformer fra 26.10 til 22.11"))).toBe(true);
    // Søndag 20–24 har for få innlegg til å være et fast tidspunkt
    expect(u.placed.some((p) => ukedag(p.date) === 6)).toBe(false);
  });

  it("tester legges på andre typer innhold i låst periode", () => {
    const u = lagUtkast([v("1", "Folka Først"), v("2", "Sitcom")], regler({ start: "2026-10-26", testsPerWeek: 1 }), heat, TODAY);
    expect(u.placed.find((p) => p.concept === "Sitcom")?.kind).toBe("Test");
    expect(u.placed.find((p) => p.concept === "Folka Først")?.kind).toBe("Basert på data");
  });

  it("før bruddet planlegges Folka Først som vanlig (høyest median)", () => {
    const u = lagUtkast([v("1", "Folka Først")], regler({ start: "2026-10-20", horizon: 3 }), heat, TODAY);
    expect(u.placed[0]).toMatchObject({ date: "2026-10-21", time: "18:00" });
  });
});

describe("CSV", () => {
  it("én rad per plattform, med Merking", () => {
    const u = lagUtkast([v("1", "Sitcom", ["instagram", "tiktok"])], regler(), heat, TODAY);
    const lines = utkastCsv(u.placed).replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe('"Dato";"Ukedag";"Klokkeslett (Oslo)";"Plattform";"Tittel";"Type innhold";"Merking";"Grunnlag"');
    expect(lines.slice(1).map((l) => l.split(";").slice(0, 4).concat(l.split(";")[6]).join(";"))).toEqual([
      '"2026-10-20";"tirsdag";"19:00";"Instagram";"Basert på data"',
      '"2026-10-20";"tirsdag";"19:00";"TikTok";"Basert på data"',
    ]);
  });
});

describe("plattformlisten", () => {
  it("Instagram, YouTube og TikTok i fast rekkefølge (Facebook legges til i konfigurasjonen senere)", () => {
    expect(PLAN_PLATTFORMER.map((p) => p.key)).toEqual(["instagram", "youtube", "tiktok"]);
  });
});

describe("oppfølging", () => {
  const test = { videoId: "1", title: "Sitcom 1", concept: "Sitcom", platform: "instagram", platformLabel: "Instagram", date: "2026-10-06", time: "21:00", weekday: 1, block: 3 };
  const content = [post("instagram", "REELS", "2026-10-06T21:04:00", 1400, { concept: "Sitcom" }), post("instagram", "REELS", "2026-10-06T19:00:00", 100, { concept: "Folka Først" })];

  it("finner innlegget: samme plattform, format og type innhold, nærmest planlagt tid", () => {
    expect(finnInnlegg(test, content)?.views).toBe(1400);
  });

  it("etter 7 dager: ganger vanlig mot medianen for typen innhold", () => {
    const s = folgOpp(test, content, heat, "2026-10-19");
    expect(s).toMatchObject({ kind: "klar", ratio: 2, conceptMedian: 700, lovende: true });
  });

  it("planlagt, venter (ikke modent) og ikke funnet", () => {
    expect(folgOpp({ ...test, date: "2026-10-25" }, content, heat, TODAY)).toEqual({ kind: "planlagt", ready: "2026-11-01" });
    expect(folgOpp(test, [{ ...content[0], is_mature: false }], heat, TODAY)).toMatchObject({ kind: "venter", ready: "2026-10-13" });
    expect(folgOpp(test, [], heat, TODAY)).toEqual({ kind: "ikke funnet" });
  });
});

describe("eksempel til oppfølging", () => {
  it("nyeste modne innlegg i et tidsrom med for få innlegg, ikke Folka Først", () => {
    const content = [
      post("instagram", "REELS", "2026-10-08T20:01:00", 1400, { concept: "Sitcom" }), // torsdag 20–24: ingen data
      post("instagram", "REELS", "2026-10-06T19:00:00", 700, { concept: "Sitcom" }), // tirsdag 16–20: 11 innlegg
      post("instagram", "REELS", "2026-10-09T20:00:00", 100, { concept: "Folka Først" }),
    ];
    expect(eksempel(content, heat)).toMatchObject({ concept: "Sitcom", published: "2026-10-08", ratio: 2, cellN: 0, weekday: 3, block: 3 });
    expect(eksempel([], heat)).toBeNull();
  });
});
