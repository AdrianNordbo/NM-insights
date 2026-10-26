import { describe, expect, it } from "vitest";
import { type HeatGrid, type HeatSection, TIDSBLOKKER } from "../analyse/heatmap";
import {
  delInnboks,
  FEIL_LAGRE,
  feilmeldingDrive,
  fraInnboks,
  type InnboksRad,
  muligDuplikat,
  normTittel,
  plasserFraInnboks,
  sjekkDriveRader,
} from "./innboks";
import type { PlanRad } from "./ukeplan";
import { ukeDager } from "./uke";

const TODAY = "2026-10-26"; // mandag i uke 44
const ID = "11111111-2222-4333-8444-555555555555";
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
const gamle: Cell[] = [
  { concept: "Sitcom", wd: 1, block: 2, n: 11, median: 1.37, time: "19:01" },
  { concept: "Folka Først", wd: 0, block: 2, n: 11, median: 0.9, time: "18:58" },
  { concept: "Folka Først", wd: 2, block: 2, n: 11, median: 2.2, time: "18:01" },
  { concept: "Folka Først", wd: 6, block: 2, n: 10, median: 1.1, time: "18:30" },
];
const heatAv = (cells: Cell[]) => ({ instagram: section("instagram", "REELS", cells), youtube: section("youtube", "SHORTS", cells), tiktok: section("tiktok", "VIDEO", cells) });
const ALLE = ["instagram", "youtube", "tiktok"];
const ingenTest = { maxPerDay: 1, gapHours: 3, testsPerWeek: 0 };

const viewRad = (over: Record<string, unknown> = {}) => ({
  drive_file_id: "1AbC_def-GhIjKlMnOp",
  konsept: "Folka Først",
  aar: 2026,
  uke: 45,
  mappe: "Folka Først/Uke 45",
  filnavn: "Veksthuset Folka Først Christian Video 12.mp4",
  drive_lenke: "https://drive.example/1AbC",
  tittel: "Christian Video 12",
  gjest: "Christian",
  yrke: "regnskapsfører",
  videonr: 12,
  tema: null,
  tolkning: "ok",
  melding: "",
  caption_skjelett: "[SKRIV BUDSKAP]\n\nChristian jobber som regnskapsfører i Eika Økonomi Øst og snakker om [SKRIV TEMA]!\n\n#podkast",
  finnes_i_drive: true,
  sist_sett: "2026-10-26T07:00:00+00:00",
  i_kalenderen: false,
  ...over,
});
const rad = (over: Record<string, unknown> = {}) => fraInnboks(viewRad(over)) as InnboksRad;
const planRad = (over: Partial<PlanRad>): PlanRad => ({
  id: "p",
  videoId: "v",
  aar: 2026,
  uke: 45,
  tittel: "T",
  konsept: "Folka Først (fra 18.10)",
  plattform: "instagram",
  dato: "2026-11-02",
  klokkeslett: "19:00",
  merking: "Basert på data",
  grunnlag: "",
  status: "Utkast",
  flyttetManuelt: false,
  ...over,
});

describe("lesing fra dashboard.drive_innboks", () => {
  it("gyldig rad leses med arbeidssted i skjelettet uendret", () => {
    const r = rad();
    expect(r).toMatchObject({ driveFileId: "1AbC_def-GhIjKlMnOp", konsept: "Folka Først", aar: 2026, uke: 45, gjest: "Christian", yrke: "regnskapsfører", iKalenderen: false });
    expect(r.skjelett).toContain("i Eika Økonomi Øst");
  });

  it("ukjent konsept, ugyldig fil-ID, uke eller tolkning, og ok uten tittel/skjelett forkastes", () => {
    for (const over of [{ konsept: "Uten kompetanse" }, { drive_file_id: "../x" }, { uke: 54 }, { tolkning: "kanskje" }, { tittel: null }, { caption_skjelett: "" }, { filnavn: "" }]) {
      expect(fraInnboks(viewRad(over)), JSON.stringify(over)).toBeNull();
    }
    expect(fraInnboks(viewRad({ tolkning: "stopp", tittel: null, caption_skjelett: null, melding: "Ukjent gjest: Ola" }))).toMatchObject({ tolkning: "stopp", melding: "Ukjent gjest: Ola" });
  });

  it("klare er ok og ikke i kalenderen; stopp og ikke tolket er egne; lagt inn vises ikke", () => {
    const rader = [
      rad({ drive_file_id: "a234567890", uke: 46, tittel: "B" }),
      rad({ drive_file_id: "b234567890", uke: 45, konsept: "Sitcom", tittel: "Kaffe", gjest: null, yrke: null }),
      rad({ drive_file_id: "c234567890", uke: 45, tittel: "A" }),
      rad({ drive_file_id: "d234567890", i_kalenderen: true }),
      rad({ drive_file_id: "e234567890", tolkning: "stopp", melding: "Mangler yrke for Line", caption_skjelett: null }),
      rad({ drive_file_id: "f234567890", tolkning: "ikke tolket", tittel: null, caption_skjelett: null, i_kalenderen: true }),
    ];
    const { klare, problemer } = delInnboks(rader);
    expect(klare.map((r) => r.driveFileId)).toEqual(["c234567890", "b234567890", "a234567890"]); // uke, så konsept
    expect(problemer.map((r) => r.driveFileId)).toEqual(["e234567890"]);
  });

  it("Fjern i kalenderen gjør raden ledig igjen: i_kalenderen = false gir den tilbake i innboksen", () => {
    // fjern_video sletter radene i planned_posts; viewet regner i_kalenderen fra planned_posts.drive_file_id
    expect(delInnboks([rad({ i_kalenderen: true })]).klare).toEqual([]);
    expect(delInnboks([rad({ i_kalenderen: false })]).klare).toHaveLength(1);
  });
});

describe("plassering fra innboksen (samme kode som manuell innlegging)", () => {
  it("Folka Først i uke 45: låst tidspunkt og bruddnavnet på alle plattformer, uken og konseptet fra Drive", () => {
    const nye = plasserFraInnboks(rad(), ALLE, ID, [], { maxPerDay: 1, gapHours: 3, testsPerWeek: 1 }, heatAv(gamle), TODAY);
    expect(nye.map((r) => r.plattform)).toEqual(ALLE);
    for (const r of nye) {
      expect(r).toMatchObject({ videoId: ID, aar: 2026, uke: 45, tittel: "Christian Video 12", konsept: "Folka Først (fra 18.10)", merking: "Basert på data" });
      expect(r.grunnlag).toMatch(/^Fast tidspunkt for Folka Først på alle plattformer fra 19\.10 til 15\.11/);
      expect(ukeDager({ aar: 2026, uke: 45 })).toContain(r.dato);
    }
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", nye)).toBeNull();
  });

  it("uke 47: tidsrommene for den nye gruppen når den har nok tall, ellers tallene fra før bruddet", () => {
    const uke47 = rad({ uke: 47 });
    const utenNye = plasserFraInnboks(uke47, ["instagram"], ID, [], ingenTest, heatAv(gamle), TODAY);
    // Første ledige dag med tall fra før bruddet: mandag 16.11 (18:58 → 19:00)
    expect(utenNye[0]).toMatchObject({ dato: "2026-11-16", klokkeslett: "19:00", konsept: "Folka Først (fra 18.10)" });
    expect(utenNye[0].grunnlag).not.toMatch(/^Fast tidspunkt/);
    const nye = [...gamle, { concept: "Folka Først (fra 18.10)", wd: 4, block: 2, n: 3, median: 1.4, time: "19:00" }];
    const medNye = plasserFraInnboks(uke47, ["instagram"], ID, [], ingenTest, heatAv(nye), TODAY);
    expect(medNye[0]).toMatchObject({ dato: "2026-11-20", klokkeslett: "19:00" }); // fredag, den nye gruppens tidsrom
  });

  it("avhuket plattform utelates; Sitcom og På Gata beholder konseptnavnet", () => {
    const sitcom = rad({ konsept: "Sitcom", tittel: "Det ordner seg, tror jeg", gjest: null, yrke: null });
    const nye = plasserFraInnboks(sitcom, ["instagram", "tiktok"], ID, [], ingenTest, heatAv(gamle), TODAY);
    expect(nye.map((r) => [r.plattform, r.konsept, r.dato])).toEqual([
      ["instagram", "Sitcom", "2026-11-03"],
      ["tiktok", "Sitcom", "2026-11-03"],
    ]);
  });

  it("ingen ledig tid: plattformen blir «ikke plassert» i samme uke, og grunnkonseptet godtas av databasen", () => {
    const passert = plasserFraInnboks(rad({ uke: 43 }), ["instagram"], ID, [], ingenTest, heatAv(gamle), TODAY);
    expect(passert[0]).toMatchObject({ aar: 2026, uke: 43, dato: null, klokkeslett: null, konsept: "Folka Først", grunnlag: "Ikke plassert: ingen dager igjen i perioden." });
    // Uke 45 der Instagram er opptatt alle låsedagene
    const tatt = ["2026-11-02", "2026-11-04", "2026-11-08"].map((d, i) => planRad({ id: `t${i}`, videoId: `v${i}`, dato: d, klokkeslett: "18:00" }));
    const full = plasserFraInnboks(rad(), ["instagram"], ID, tatt, ingenTest, heatAv(gamle), TODAY);
    expect(full[0]).toMatchObject({ uke: 45, dato: null });
    expect(full[0].grunnlag).toMatch(/^Ikke plassert:/);
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", full)).toBeNull();
  });
});

describe("manuelle dubletter", () => {
  it("normaliserte titler", () => {
    expect(normTittel("Veksthuset Folka Først Christian Video 12")).toBe("christian video 12");
    expect(normTittel("Veksthuset Folka Først Christian Video 12.mp4")).toBe("christian video 12");
    expect(normTittel("45. Det ordner seg, tror jeg")).toBe("det ordner seg tror jeg");
    expect(normTittel("Veksthuset På Gata Impulskjøp")).toBe("impulskjøp");
  });

  it("treff i samme uke og konsept, ikke i annen uke eller annet konsept", () => {
    const manuell = planRad({ tittel: "Veksthuset Folka Først Christian Video 12" });
    expect(muligDuplikat(rad(), [manuell])).toBe(manuell);
    expect(muligDuplikat(rad(), [planRad({ tittel: "Christian Video 12", konsept: "Folka Først" })])).not.toBeNull();
    expect(muligDuplikat(rad(), [{ ...manuell, uke: 46 }])).toBeNull();
    expect(muligDuplikat(rad(), [{ ...manuell, konsept: "Sitcom" }])).toBeNull();
    expect(muligDuplikat(rad(), [planRad({ tittel: "Christian Video 11" })])).toBeNull();
  });
});

describe("feilmeldinger og formatsjekk", () => {
  it("databasefeil på norsk, aldri teknisk", () => {
    expect(feilmeldingDrive("P0001", "Videoen ligger allerede i kalenderen")).toBe("Videoen ligger allerede i kalenderen.");
    expect(feilmeldingDrive("P0001", "Uken må være uken fra Drive-mappen (2026 uke 45)")).toBe("Uken må være uken fra Drive-mappen (2026 uke 45).");
    expect(feilmeldingDrive("23505", 'duplicate key value violates unique constraint "planned_posts_drive_unik"')).toBe("Videoen ligger allerede i kalenderen.");
    expect(feilmeldingDrive("23514", 'new row violates check constraint "planned_posts_i_uken"')).toBe("Plasseringen er ugyldig (dag eller klokkeslett utenfor uken).");
    expect(feilmeldingDrive("PGRST202", "Could not find the function")).toBe("Drive-innboksen er ikke satt opp i databasen ennå.");
    expect(feilmeldingDrive("XX000", "internal error")).toBe(FEIL_LAGRE);
    expect(feilmeldingDrive(undefined, undefined)).toBe(FEIL_LAGRE);
  });

  it("ugyldig fil-ID, ulike videoer, blandede uker og samme plattform to ganger avvises", () => {
    const nye = plasserFraInnboks(rad(), ALLE, ID, [], ingenTest, heatAv(gamle), TODAY);
    expect(sjekkDriveRader("x", nye)).toBe("Ugyldig video fra Drive.");
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", [])).toBe("Velg minst én plattform.");
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", [nye[0], { ...nye[1], videoId: "22222222-2222-4333-8444-555555555555" }])).toBe("Ugyldig plassering.");
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", [nye[0], { ...nye[1], uke: 46, dato: null }])).toBe("Ugyldig plassering.");
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", [nye[0], { ...nye[0] }])).toBe("Samme plattform to ganger.");
    expect(sjekkDriveRader("1AbC_def-GhIjKlMnOp", [{ ...nye[0], dato: "2026-11-09" }])).toBe("Ugyldig plassering."); // dag utenfor uken
  });
});
