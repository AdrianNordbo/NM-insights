import { describe, expect, it } from "vitest";
import {
  captionVideoer,
  endret,
  etikett,
  feilmeldingPlan,
  gjenstaar,
  harSkriv,
  klarSperre,
  kopierTilAlle,
  lagretMelding,
  MAKS_CAPTION,
  sjekkCaption,
  startTekst,
  statusEtter,
  tegn,
  tilLagring,
  youtubeTittel,
} from "./caption";
import { FEIL_LAGRE } from "./innboks";
import type { PlanRad } from "./ukeplan";

const SKJELETT = "[SKRIV BUDSKAP]\n\nChristian jobber som regnskapsfører og snakker om [SKRIV TEMA]!\n\n#podkast";
const rad = (over: Partial<PlanRad> = {}): PlanRad => ({
  id: "p1",
  videoId: "v1",
  aar: 2026,
  uke: 45,
  tittel: "Christian Video 7",
  konsept: "Folka Først (fra 18.10)",
  plattform: "instagram",
  dato: "2026-11-02",
  klokkeslett: "19:00",
  merking: "Basert på data",
  grunnlag: "",
  status: "Utkast",
  flyttetManuelt: false,
  captionSkjelett: SKJELETT,
  captionTekst: null,
  ...over,
});

describe("Klar-sperre (samme regel som sett_status)", () => {
  it("ferdig tekst går foran skjelettet; tom tekst bruker skjelettet", () => {
    expect(klarSperre(rad())).toMatch(/^Klar er sperret/);
    expect(klarSperre(rad({ captionTekst: "Ferdig tekst" }))).toBeNull();
    expect(klarSperre(rad({ captionTekst: "Halvferdig [SKRIV TEMA]" }))).not.toBeNull();
  });

  it("poster uten caption kan settes til Klar som før", () => {
    expect(klarSperre(rad({ captionSkjelett: null, captionTekst: null }))).toBeNull();
  });

  it("bare [SKRIV med store bokstaver sperrer, som LIKE i SQL", () => {
    expect(harSkriv("[skriv tema]")).toBe(false);
    expect(harSkriv("[SKRIV")).toBe(true);
    expect(harSkriv(null)).toBe(false);
  });
});

describe("feltet", () => {
  it("gjenstår lister alle [SKRIV …] uten dubletter", () => {
    expect(gjenstaar(SKJELETT)).toEqual(["[SKRIV BUDSKAP]", "[SKRIV TEMA]"]);
    expect(gjenstaar("[SKRIV TEMA] og [SKRIV TEMA]")).toEqual(["[SKRIV TEMA]"]);
    expect(gjenstaar("Ferdig")).toEqual([]);
    expect(gjenstaar(null)).toEqual([]);
  });

  it("tegn telles som i databasen: emoji og æøå er ett tegn, mellomrom i endene teller ikke", () => {
    expect(tegn("æøå")).toBe(3);
    expect(tegn("👍🏽")).toBe(2); // to kodepunkter (emoji + hudtone), som length() i Postgres
    expect(tegn("  hei  ")).toBe(3);
    expect(sjekkCaption("x".repeat(MAKS_CAPTION))).toBeNull();
    expect(sjekkCaption("x".repeat(MAKS_CAPTION + 1))).toBe("Teksten er for lang (maks 2 200 tegn).");
    expect(sjekkCaption("😀".repeat(MAKS_CAPTION))).toBeNull(); // 4400 i JavaScript-lengde
  });

  it("starter med ferdig tekst, ellers skjelettet, ellers tomt", () => {
    expect(startTekst(rad())).toBe(SKJELETT);
    expect(startTekst(rad({ captionTekst: "Min" }))).toBe("Min");
    expect(startTekst(rad({ captionSkjelett: null }))).toBe("");
  });

  it("tekst lik skjelettet lagres som tom (skjelettet gjelder), og teksten trimmes", () => {
    expect(tilLagring(SKJELETT, SKJELETT)).toBe("");
    expect(tilLagring(`  ${SKJELETT}\n`, SKJELETT)).toBe("");
    expect(tilLagring("  Min tekst \n", SKJELETT)).toBe("Min tekst");
    expect(tilLagring("Min tekst", null)).toBe("Min tekst");
  });

  it("etiketten skiller skjelett, egen tekst og ulagret tekst", () => {
    expect(etikett(SKJELETT, rad())).toBe("Skjelett, ikke endret");
    expect(etikett("Ny", rad())).toBe("Din tekst, ikke lagret");
    expect(etikett("Min", rad({ captionTekst: "Min" }))).toBe("Din tekst");
    expect(etikett("Min ", rad({ captionTekst: "Min" }))).toBe("Din tekst"); // bare mellomrom er ikke en endring
    expect(etikett("", rad({ captionSkjelett: null }))).toBe("Ingen caption");
    expect(endret(SKJELETT, rad())).toBe(false);
    expect(endret(SKJELETT, rad({ captionTekst: "Min" }))).toBe(true); // tilbake til skjelettet = lagre tomt
  });
});

describe("status etter lagring (som lagre_caption)", () => {
  it("Klar blir Utkast når den lagrede teksten har [SKRIV", () => {
    expect(statusEtter(rad({ status: "Klar", captionTekst: "Ferdig" }), "Ny [SKRIV TEMA]")).toBe("Utkast");
    expect(statusEtter(rad({ status: "Klar", captionTekst: "Ferdig" }), "Ny ferdig")).toBe("Klar");
  });

  it("tom tekst: skjelettet avgjør", () => {
    expect(statusEtter(rad({ status: "Klar" }), "  ")).toBe("Utkast");
    expect(statusEtter(rad({ status: "Klar", captionSkjelett: "Vi spør folk på gata: Lønn" }), "")).toBe("Klar");
  });

  it("Utkast og Publisert røres ikke", () => {
    expect(statusEtter(rad({ status: "Utkast" }), "[SKRIV")).toBe("Utkast");
    expect(statusEtter(rad({ status: "Publisert" }), "[SKRIV")).toBe("Publisert");
  });

  it("meldingen sier hva som ble lagret og hva som ble satt tilbake", () => {
    expect(lagretMelding([{ rad: rad(), tekst: "Ferdig" }])).toBe("Lagret.");
    expect(lagretMelding([{ rad: rad({ status: "Klar" }), tekst: "[SKRIV TEMA]" }])).toBe("Lagret. Instagram er satt tilbake til Utkast fordi teksten har [SKRIV …].");
    const tre = ["instagram", "youtube", "tiktok"].map((plattform) => ({ rad: rad({ plattform, status: plattform === "instagram" ? "Utkast" : "Klar" }), tekst: "Hei [SKRIV X]" }));
    expect(lagretMelding(tre)).toBe("Lagret på Instagram, YouTube og TikTok. YouTube og TikTok er satt tilbake til Utkast fordi teksten har [SKRIV …].");
  });
});

describe("Bruk samme tekst på alle plattformene", () => {
  const rader = [rad({ id: "a" }), rad({ id: "b", plattform: "youtube" }), rad({ id: "c", plattform: "tiktok", captionTekst: "Egen TikTok-tekst" })];

  it("lagrer på alle plattformene og sier hvem som har egen tekst som overskrives", () => {
    const felt = { a: "Ny tekst", b: SKJELETT, c: "Egen TikTok-tekst" };
    const { lagre, overskriver } = kopierTilAlle(rader[0], "Ny tekst", rader, felt);
    expect(lagre).toEqual([
      { id: "a", plattform: "instagram", tekst: "Ny tekst" },
      { id: "b", plattform: "youtube", tekst: "Ny tekst" },
      { id: "c", plattform: "tiktok", tekst: "Ny tekst" },
    ]);
    expect(overskriver).toEqual(["TikTok"]); // YouTube har bare skjelettet
  });

  it("ikke lagret tekst i et annet felt teller også; lik tekst krever ingen bekreftelse", () => {
    expect(kopierTilAlle(rader[0], "Ny", rader, { a: "Ny", b: "Ulagret YouTube", c: "Ny" }).overskriver).toEqual(["YouTube"]);
    expect(kopierTilAlle(rader[0], "Ny", rader.slice(0, 2), { a: "Ny", b: "Ny " }).overskriver).toEqual([]);
  });

  it("skjelettet kopiert til alle lagres som tomt", () => {
    expect(kopierTilAlle(rader[0], SKJELETT, rader, {}).lagre.map((l) => l.tekst)).toEqual(["", "", ""]);
  });
});

describe("YouTube-tittel (første linje)", () => {
  it("første linje, også med CRLF", () => {
    expect(youtubeTittel("Lønn på gata\r\n\r\nResten #pågata")).toEqual({ tittel: "Lønn på gata", advarsler: [] });
  });

  it("advarer om tom linje, over 100 tegn og < >", () => {
    expect(youtubeTittel("\n\nTekst").advarsler).toEqual(["Første linje er tom."]);
    expect(youtubeTittel("").advarsler).toEqual(["Første linje er tom."]);
    expect(youtubeTittel("x".repeat(134)).advarsler).toEqual(["Første linje er 134 tegn; YouTube tillater 100."]);
    expect(youtubeTittel("x".repeat(100)).advarsler).toEqual([]);
    expect(youtubeTittel("a < b").advarsler).toEqual(["Tittelen kan ikke ha < eller >."]);
  });
});

describe("feilmeldinger fra databasen", () => {
  it("egne meldinger (P0001) vises på norsk", () => {
    expect(feilmeldingPlan("P0001", "Captionen har fortsatt [SKRIV …] og kan ikke settes til Klar", "status")).toBe(
      "Captionen har fortsatt [SKRIV …] og kan ikke settes til Klar.",
    );
    expect(feilmeldingPlan("P0001", "Bare redaktører kan endre kalenderen", "caption")).toBe("Bare redaktører kan endre kalenderen.");
    expect(feilmeldingPlan("P0001", "Ikke innlogget", "caption")).toBe("Du er ikke innlogget. Last siden på nytt og logg inn.");
    expect(feilmeldingPlan("P0001", "Fant ikke plasseringen", "status")).toBe("Fant ikke plasseringen. Last siden på nytt.");
  });

  it("kjente koder oversettes, resten blir standardmeldingen", () => {
    expect(feilmeldingPlan("23514", "new row violates check constraint", "caption")).toBe("Teksten er for lang (maks 2 200 tegn).");
    expect(feilmeldingPlan("PGRST202", "Could not find the function", "caption")).toBe("Caption er ikke satt opp i databasen ennå.");
    expect(feilmeldingPlan("42883", "function does not exist", "status")).toBe(FEIL_LAGRE);
    expect(feilmeldingPlan("23514", "x", "status")).toBe(FEIL_LAGRE);
    expect(feilmeldingPlan(undefined, undefined, "caption")).toBe(FEIL_LAGRE);
  });
});

describe("captionene i uken", () => {
  const rader = [
    rad({ id: "a2", videoId: "v2", tittel: "Sitcom 45", konsept: "Sitcom", plattform: "tiktok", dato: "2026-11-03", captionSkjelett: "[SKRIV SPØRSMÅL TIL FØLGERNE]" }),
    rad({ id: "a1", videoId: "v2", tittel: "Sitcom 45", konsept: "Sitcom", plattform: "instagram", dato: "2026-11-03", captionSkjelett: "[SKRIV SPØRSMÅL TIL FØLGERNE]" }),
    rad({ id: "b1", videoId: "v1", plattform: "youtube", dato: "2026-11-02" }),
    rad({ id: "m1", videoId: "v3", tittel: "Manuell", konsept: "På Gata", dato: "2026-11-05", captionSkjelett: null }),
  ];

  it("én gruppe per video, sortert på første dato, plattformene i fast rekkefølge", () => {
    const v = captionVideoer(rader, true);
    expect(v.map((x) => x.videoId)).toEqual(["v1", "v2", "v3"]);
    expect(v[1].rader.map((r) => r.plattform)).toEqual(["instagram", "tiktok"]);
    expect(v.map((x) => x.fraDrive)).toEqual([true, true, false]);
  });

  it("andre innloggede ser bare videoer med skjelett eller ferdig tekst", () => {
    expect(captionVideoer(rader, false).map((x) => x.videoId)).toEqual(["v1", "v2"]);
    const medTekst = [...rader.slice(0, 3), rad({ id: "m1", videoId: "v3", captionSkjelett: null, captionTekst: "Skrevet manuelt" })];
    expect(captionVideoer(medTekst, false).map((x) => x.videoId)).toContain("v3");
  });
});
