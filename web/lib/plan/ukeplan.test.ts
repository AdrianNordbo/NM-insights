import { describe, expect, it } from "vitest";
import { type HeatGrid, type HeatSection, TIDSBLOKKER } from "../analyse/heatmap";
import { PLAN_KONSEPTER, UKEMIKS } from "../regler/plan";
import { fraView, grunnKonsept, kanFlytte, konseptNavn, miks, miksAvvik, type PlanRad, planCsv, plasserIUke, tittelFraFilnavn } from "./ukeplan";
import { ukeDager } from "./uke";

const TODAY = "2026-10-21"; // onsdag i uke 43
type Cell = { concept: string; wd: number; block: number; n: number; median?: number; time?: string };
function section(platform: "instagram" | "youtube" | "tiktok", format: "REELS" | "SHORTS" | "VIDEO", cells: Cell[]): HeatSection {
  const empty = (): HeatGrid => Array.from({ length: 7 }, () => TIDSBLOKKER.map(() => ({ n: 0, median: null, time: null })));
  const grids: Record<string, HeatGrid> = { alle: empty() };
  for (const c of cells) {
    grids[c.concept] ??= empty();
    grids[c.concept][c.wd][c.block] = { n: c.n, median: c.median ?? 1, time: c.time ?? "19:00" };
  }
  return { platform, format, n: 0, concepts: Object.keys(grids).filter((k) => k !== "alle"), conceptPosts: {}, conceptMedian: {}, grids };
}
const cells: Cell[] = [
  { concept: "Sitcom", wd: 1, block: 2, n: 11, median: 1.37, time: "19:01" }, // tirsdag
  { concept: "Folka Først", wd: 0, block: 2, n: 11, median: 0.9, time: "18:58" }, // mandag
  { concept: "Folka Først", wd: 2, block: 2, n: 11, median: 2.2, time: "18:01" }, // onsdag
  { concept: "Folka Først", wd: 6, block: 2, n: 10, median: 1.1, time: "18:30" }, // søndag
];
const heat = { instagram: section("instagram", "REELS", cells), youtube: section("youtube", "SHORTS", cells), tiktok: section("tiktok", "VIDEO", cells) };
const regler = { maxPerDay: 1, gapHours: 3, testsPerWeek: 1 };
const v = (id: string, concept: string, platforms = ["instagram", "youtube", "tiktok"]) => ({ id, title: `${concept} ${id}`, concept, platforms });
const rad = (over: Partial<PlanRad>): PlanRad => ({
  id: "r",
  videoId: "v",
  aar: 2026,
  uke: 45,
  tittel: "T",
  konsept: "Sitcom",
  plattform: "instagram",
  dato: "2026-11-03",
  klokkeslett: "19:00",
  merking: "Basert på data",
  grunnlag: "",
  status: "Utkast",
  flyttetManuelt: false,
  captionSkjelett: null,
  captionTekst: null,
  ...over,
});

describe("plassering innenfor valgt uke", () => {
  it("alle plattformer i uken, aldri utenfor", () => {
    const uke = { aar: 2026, uke: 45 };
    const r = plasserIUke(v("1", "Sitcom"), uke, [], regler, heat, TODAY);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.dato && ukeDager(uke).includes(x.dato) && x.aar === 2026 && x.uke === 45)).toBe(true);
  });

  it("full uke: ikke plassert i uken, ikke flyttet til neste uke", () => {
    const uke = { aar: 2026, uke: 45 };
    const tatt = ["instagram", "youtube", "tiktok"].map((p) => rad({ plattform: p, dato: "2026-11-03", klokkeslett: "19:00" }));
    const r = plasserIUke(v("2", "Sitcom"), uke, tatt, regler, heat, TODAY);
    // Sitcom har bare tirsdag med tall; test samme tirsdag er ikke ledig (maks 1 per dag) → ikke plassert
    expect(r.every((x) => x.dato === null && x.grunnlag.startsWith("Ikke plassert:"))).toBe(true);
  });

  it("uke som er passert gir ikke plassert, og bare dager etter i dag brukes", () => {
    const passert = plasserIUke(v("3", "Sitcom", ["instagram"]), { aar: 2026, uke: 42 }, [], regler, heat, TODAY);
    expect(passert[0]).toMatchObject({ dato: null, grunnlag: "Ikke plassert: ingen dager igjen i perioden." });
    // Uke 43: mandag og tirsdag er passert (i dag onsdag 21.10), så Sitcom får ikke tirsdag
    const naa = plasserIUke(v("4", "Sitcom", ["instagram"]), { aar: 2026, uke: 43 }, [], { ...regler, testsPerWeek: 0 }, heat, TODAY);
    expect(naa[0].dato).toBeNull();
  });

  it("årsskifte: uke 53 i 2026 bruker dagene 28.12–03.01", () => {
    const r = plasserIUke(v("5", "Sitcom", ["instagram"]), { aar: 2026, uke: 53 }, [], regler, heat, TODAY);
    expect(r[0].dato).toBe("2026-12-29");
    expect(r[0]).toMatchObject({ aar: 2026, uke: 53 });
  });

  it("tester per plattform og uke teller med radene som allerede ligger i uken", () => {
    const uke = { aar: 2026, uke: 46 };
    const ingenTest = plasserIUke(v("6", "På Gata", ["instagram"]), uke, [rad({ uke: 46, dato: "2026-11-12", konsept: "På Gata", merking: "Test" })], regler, heat, TODAY);
    expect(ingenTest[0].dato).toBeNull();
    const test = plasserIUke(v("7", "På Gata", ["instagram"]), uke, [], regler, heat, TODAY);
    expect(test[0]).toMatchObject({ merking: "Test" });
  });

  it("Folka Først fra 19.10 lagres som «Folka Først (fra 18.10)» og holder fast tidspunkt i låsen", () => {
    const r = plasserIUke(v("8", "Folka Først"), { aar: 2026, uke: 45 }, [], { ...regler, testsPerWeek: 1 }, heat, TODAY);
    expect(r.every((x) => x.konsept === "Folka Først (fra 18.10)" && x.merking === "Basert på data")).toBe(true);
    expect(r[0].grunnlag).toMatch(/^Fast tidspunkt for Folka Først på alle plattformer fra 19.10 til 15.11/);
    expect(konseptNavn("Folka Først", "2026-10-17")).toBe("Folka Først");
    expect(grunnKonsept("Folka Først (fra 18.10)")).toBe("Folka Først");
  });
});

describe("ukemiks", () => {
  it("fast miks fra konfigurasjonen", () => {
    expect(UKEMIKS).toEqual({ "Folka Først": 3, Sitcom: 1, "På Gata": 1 });
    expect([...PLAN_KONSEPTER]).toEqual(["Folka Først", "Sitcom", "På Gata"]);
  });

  it("teller videoer (ikke plattformer) og varsler ved avvik uten å blokkere", () => {
    const rows = [
      rad({ videoId: "a", konsept: "Folka Først (fra 18.10)", plattform: "instagram" }),
      rad({ videoId: "a", konsept: "Folka Først (fra 18.10)", plattform: "tiktok" }),
      rad({ videoId: "b", konsept: "Folka Først (fra 18.10)" }),
      rad({ videoId: "c", konsept: "Folka Først (fra 18.10)" }),
      rad({ videoId: "d", konsept: "Folka Først (fra 18.10)" }),
      rad({ videoId: "e", konsept: "På Gata", dato: null, klokkeslett: null }),
      rad({ videoId: "x", uke: 46, konsept: "Sitcom" }),
    ];
    const uke = { aar: 2026, uke: 45 };
    expect(miks(uke, rows)).toEqual([
      { konsept: "Folka Først", har: 4, skal: 3 },
      { konsept: "Sitcom", har: 0, skal: 1 },
      { konsept: "På Gata", har: 1, skal: 1 },
    ]);
    expect(miksAvvik(uke, rows)).toEqual(["Uke 45 har 4 Folka Først", "Uke 45 mangler 1 Sitcom"]);
  });
});

describe("manuell flytting", () => {
  it("bare innenfor samme uke og med gyldig klokkeslett", () => {
    const r = rad({ aar: 2026, uke: 45 });
    expect(kanFlytte(r, "2026-11-08", "21:30")).toBeNull();
    expect(kanFlytte(r, "2026-11-09", "21:30")).toBe("Datoen må være i samme uke.");
    expect(kanFlytte(r, "2026-11-04", "25:00")).toBe("Klokkeslett må være på formen TT:MM.");
    expect(kanFlytte({ aar: 2026, uke: 53 }, "2027-01-03", "18:00")).toBeNull();
  });
});

describe("CSV og fil", () => {
  it("kolonnene dato, ukedag, klokkeslett, plattform, tittel, konsept, merking, grunnlag og status", () => {
    const csv = planCsv([rad({ flyttetManuelt: true, status: "Klar", grunnlag: "G" }), rad({ id: "2", plattform: "tiktok", dato: null, klokkeslett: null, merking: null })]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe('"Dato";"Ukedag";"Klokkeslett (Oslo)";"Plattform";"Tittel";"Type innhold";"Merking";"Grunnlag";"Status";"Caption-skjelett";"Caption (ferdig)"');
    expect(lines[1]).toBe('"2026-11-03";"tirsdag";"19:00";"Instagram";"T";"Sitcom";"Basert på data (flyttet manuelt)";"G";"Klar";"";""');
    expect(lines[2]).toBe('"";"ikke plassert";"";"TikTok";"T";"Sitcom";"";"";"Utkast";"";""');
  });

  it("caption-kolonnene står bakerst, med linjeskift og anførselstegn i felt", () => {
    const csv = planCsv([rad({ captionSkjelett: "[SKRIV BUDSKAP]\n\n#podkast", captionTekst: 'Hei «alle»\nSi "ja"' })]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('"2026-11-03";"tirsdag";"19:00";"Instagram";"T";"Sitcom";"Basert på data";"";"Utkast";"[SKRIV BUDSKAP]\n\n#podkast";"Hei «alle»\nSi ""ja"""');
  });

  it("tittel fra filnavnet (filen leses ikke)", () => {
    expect(tittelFraFilnavn("folka_forst-episode-14.mp4")).toBe("folka forst episode 14");
    expect(tittelFraFilnavn("Sitcom  Mandagsmøte.MOV")).toBe("Sitcom Mandagsmøte");
  });
});

describe("lesing fra viewet", () => {
  it("gyldige rader leses, ufullstendige forkastes", () => {
    const r = fraView({ id: "1", video_id: "v", aar: 2026, uke: 45, tittel: "T", konsept: "Sitcom", plattform: "instagram", planlagt_dato: "2026-11-03", klokkeslett: "19:00:00", merking: "Test", grunnlag: "g", status: "Klar", flyttet_manuelt: true });
    expect(r).toMatchObject({ klokkeslett: "19:00", merking: "Test", status: "Klar", flyttetManuelt: true });
    expect(r).toMatchObject({ captionSkjelett: null, captionTekst: null }); // viewet uten caption-kolonnene
    expect(fraView({ id: "1" })).toBeNull();
    expect(fraView({ id: "1", video_id: "v", aar: 2026, uke: 45, tittel: "T", konsept: "S", plattform: "i", status: "Ukjent" })).toBeNull();
  });

  it("caption-kolonnene er valgfrie; tom tekst blir null", () => {
    const base = { id: "1", video_id: "v", aar: 2026, uke: 45, tittel: "T", konsept: "Sitcom", plattform: "instagram", status: "Utkast" };
    expect(fraView({ ...base, caption_skjelett: "[SKRIV X]", caption_tekst: "Ferdig" })).toMatchObject({ captionSkjelett: "[SKRIV X]", captionTekst: "Ferdig" });
    expect(fraView({ ...base, caption_skjelett: "S", caption_tekst: "  " })).toMatchObject({ captionSkjelett: "S", captionTekst: null });
    expect(fraView({ ...base, caption_skjelett: null, caption_tekst: 5 })).toMatchObject({ captionSkjelett: null, captionTekst: null });
  });
});
