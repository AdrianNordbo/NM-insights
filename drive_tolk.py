"""
NM Insights - tolkning av mappe- og filnavn fra Google Drive (rene funksjoner, ingen nettverk).

Struktur i Drive:  Veksthuset > <Konsept> > Uke NN > filer.

- Konseptmapper: «Folka Først», «På Gata» og «Sit-com» (→ Sitcom). «Uten Kompetanse», «VM-innhold» og
  «Teasere» hoppes over. Andre mapper meldes som ukjente.
- «Uke NN» har ikke årstall og tolkes fremover i tid: fra og med inneværende ISO-uke og høyst
  HORISONT_UKER uker frem. En uke som finnes i år, men er passert, tolkes som neste år og faller da utenfor
  horisonten. «ÅÅ - Uke NN» (f.eks. «27 - Uke 1») har eksplisitt år og tolkes ikke fremover; er den passert,
  ignoreres den. Uke 53 finnes bare i noen år.
- Sitcom/Drafts hoppes over (bare én linje i oppsummeringen).
- gjester.csv og notatene leses som UTF-8 og ellers som Windows-1252 (lagret i Excel), med advarsel.
- Folka Først: «Veksthuset Folka Først <gjest> Video <nr>.mp4». Gjesten slås opp i config/gjester.csv med
  helt likt navn. Ukjent gjest og tomt yrke gir stopp; ingenting gjettes. config/notater/<ÅÅÅÅ>-W<NN>.csv
  (fil;yrke;budskap) kan overstyre yrket og gi budskapet for én video.
- På Gata: temaet er filnavnet (uten filtype, «Veksthuset På Gata»-prefiks og «Video N»).
  Sitcom: «NN. Tittel.mp4», der NN er ukenummeret (lik ukemappen, ellers merknad); tittelen er resten.
  Ingen gjesteliste (navn som Markus slås ikke opp), og ikke videonr.
- Folka Først-kopier («… Video 2 (1).mp4»): tolkes som originalnavnet bare når originalen ikke finnes i samme
  ukemappe og det bare er én kopi for gjesten og nummeret der; ellers «ikke tolket» med årsak.
- Alle navn normaliseres til NFC (filer fra Mac kan ha «ø» og «å» som to tegn).
- Folka Først-linjen velges blant variantene i config/caption_varianter.csv (med eller uten arbeidssted), stabilt
  per fil: crc32 av fil-ID-en i Drive (ellers filnavnet) modulo antall varianter. Uten filen brukes standardmalen.
- Caption-skjelettet har [SKRIV BUDSKAP] og [SKRIV TEMA] (og for Sitcom [SKRIV SPØRSMÅL TIL FØLGERNE]),
  som fylles ut manuelt. Hashtags fra config/caption_maler.csv er stil, ikke dokumentert effekt.

Tolkningen er 'ok', 'stopp' (gjesten må rettes i listen eller notatene) eller 'ikke tolket' (filen passer
ikke mønsteret). Bare 'ok' kan legges i kalenderen.
"""
import csv
import io
import re
import string
import unicodedata
import zlib
from dataclasses import dataclass, field
from datetime import date

HORISONT_UKER = 12          # uker frem fra inneværende uke som tas med
MAKS_HASHTAGS = 5
VIDEO_ENDINGER = (".mp4", ".mov", ".m4v")

KONSEPT_MAPPER = {"folka først": "Folka Først", "på gata": "På Gata", "sit-com": "Sitcom"}
IGNORERTE_MAPPER = {"uten kompetanse", "vm-innhold", "teasere"}
IGNORERTE_UNDERMAPPER = {"Sitcom": {"drafts"}}  # under konseptmappen, uten merknad per kjøring

OK, STOPP, IKKE_TOLKET = "ok", "stopp", "ikke tolket"

SKRIV_BUDSKAP = "[SKRIV BUDSKAP]"
SKRIV_TEMA = "[SKRIV TEMA]"
SKRIV_SPORSMAL = "[SKRIV SPØRSMÅL TIL FØLGERNE]"


def nfc(tekst):
    """NFC, trimmet og med enkle mellomrom."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", tekst or "")).strip()


# ---------------------------------------------------------------------------
# Mapper
# ---------------------------------------------------------------------------

def konsept_for_mappe(navn):
    """('konsept', 'Folka Først') | ('ignorert', None) | ('ukjent', None)."""
    n = nfc(navn).lower()
    if n in KONSEPT_MAPPER:
        return "konsept", KONSEPT_MAPPER[n]
    if n in IGNORERTE_MAPPER:
        return "ignorert", None
    return "ukjent", None


UKE_RE = re.compile(r"^uke\s*0*(\d{1,2})$", re.IGNORECASE)
AAR_UKE_RE = re.compile(r"^(\d{2})\s*-\s*uke\s*0*(\d{1,2})$", re.IGNORECASE)  # «27 - Uke 1» = uke 1 i 2027


def tolk_uke(mappenavn, i_dag, horisont=HORISONT_UKER):
    """
    «Uke NN» (tolkes fremover) eller «ÅÅ - Uke NN» (eksplisitt år 20ÅÅ) → ((aar, uke), None),
    eller (None, grunn) når mappen ikke brukes. i_dag er dagens dato (Oslo); inneværende ISO-uke er med.
    """
    navn = nfc(mappenavn)
    aar_naa, uke_naa, _ = i_dag.isocalendar()
    m, ma = UKE_RE.match(navn), AAR_UKE_RE.match(navn)
    if not m and not ma:
        return None, f"«{navn}» er ikke en ukemappe («Uke NN» eller «ÅÅ - Uke NN»)"
    nn = int((m or ma).group(1 if m else 2))
    if not 1 <= nn <= 53:
        return None, f"«{navn}»: uke {nn} finnes ikke"
    naa = date.fromisocalendar(aar_naa, uke_naa, 1)
    if ma:
        aar = 2000 + int(ma.group(1))
        try:
            start = date.fromisocalendar(aar, nn, 1)
        except ValueError:
            return None, f"«{navn}»: {aar} har ikke uke {nn} (ignorert)"
        if start < naa:
            return None, f"«{navn}»: {aar}-W{nn:02d} er passert (ignorert)"
    else:
        aar = aar_naa if nn >= uke_naa else aar_naa + 1
        try:
            start = date.fromisocalendar(aar, nn, 1)
        except ValueError:
            return None, f"Uke {nn}: {aar} har ikke uke {nn}, og uke {nn} i {aar_naa} er passert (ignorert)"
    frem = (start - naa).days // 7
    if frem > horisont:
        hvem = f"«{navn}» er" if ma else f"Uke {nn} tolkes som"
        return None, f"{hvem} {aar}-W{nn:02d}, {frem} uker frem (mer enn {horisont}, ignorert)"
    return (aar, nn), None


def uke_nokkel(aar, uke):
    """2026, 45 → '2026-W45' (navnet på notatfilen)."""
    return f"{aar}-W{uke:02d}"


# ---------------------------------------------------------------------------
# Gjesteliste, notater og maler
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Gjest:
    navn: str
    yrke: str
    arbeidssted: str
    bruk_arbeidssted: bool

    @property
    def fornavn(self):
        return self.navn.split(" ")[0]


def dekod(data, navn):
    """
    Bytes fra gjester.csv eller en notatfil → (tekst, advarsel eller None). UTF-8 (med eller uten BOM)
    først; filer lagret i Excel er ofte Windows-1252, og leses da med en advarsel. Filen endres aldri.
    """
    try:
        return data.decode("utf-8-sig"), None
    except UnicodeDecodeError:
        pass
    try:
        return data.decode("cp1252"), f"{navn} er ikke UTF-8 (lest som Windows-1252); lagre den gjerne på nytt som UTF-8"
    except UnicodeDecodeError:
        raise ValueError(f"{navn} kan ikke leses som UTF-8 eller Windows-1252") from None


def _rader(tekst, kolonner, hva):
    les = csv.DictReader(io.StringIO(tekst.lstrip("﻿")), delimiter=";")
    if [nfc(k).lower() for k in (les.fieldnames or [])] != kolonner:
        raise ValueError(f"{hva}: kolonnene må være {';'.join(kolonner)}")
    for i, rad in enumerate(les, start=2):
        yield i, {k: nfc(v) for k, v in zip(kolonner, (rad.get(f) for f in les.fieldnames))}


def les_gjester(tekst):
    """Innholdet i config/gjester.csv → {navn i små bokstaver: Gjest}."""
    out = {}
    for linje, r in _rader(tekst, ["navn", "yrke", "arbeidssted", "bruk_arbeidssted"], "gjester.csv"):
        if not r["navn"]:
            raise ValueError(f"gjester.csv linje {linje}: mangler navn")
        bruk = r["bruk_arbeidssted"].lower()
        if bruk not in ("ja", "nei"):
            raise ValueError(f"gjester.csv linje {linje}: bruk_arbeidssted må være «ja» eller «nei»")
        if bruk == "ja" and not r["arbeidssted"]:
            raise ValueError(f"gjester.csv linje {linje}: bruk_arbeidssted er «ja», men arbeidssted mangler")
        key = r["navn"].lower()
        if key in out:
            raise ValueError(f"gjester.csv linje {linje}: {r['navn']} står to ganger (bruk etternavnsinitial)")
        out[key] = Gjest(r["navn"], r["yrke"], r["arbeidssted"], bruk == "ja")
    return out


def les_notater(tekst):
    """Innholdet i config/notater/<ÅÅÅÅ>-W<NN>.csv → {filnavn i små bokstaver: {'yrke', 'budskap'}}."""
    out = {}
    for linje, r in _rader(tekst, ["fil", "yrke", "budskap"], "notater"):
        if not r["fil"]:
            raise ValueError(f"notater linje {linje}: mangler fil")
        out[r["fil"].lower()] = {"yrke": r["yrke"], "budskap": r["budskap"]}
    return out


PLASSHOLDERE = {"navn", "yrke", "arbeidssted"}


def les_varianter(tekst):
    """
    Innholdet i config/caption_varianter.csv (konsept;med_arbeidssted;mal) → {(konsept, med_arbeidssted): [maler]}.
    Malen må ha {navn} og bokstavelig [SKRIV TEMA] (sperren for Klar leter etter «[SKRIV»), og {arbeidssted} bare
    i varianter med arbeidssted.
    """
    out = {}
    for linje, r in _rader(tekst, ["konsept", "med_arbeidssted", "mal"], "caption_varianter.csv"):
        if not any(r.values()):
            continue
        med = r["med_arbeidssted"].lower()
        if r["konsept"] not in KONSEPT_MAPPER.values():
            raise ValueError(f"caption_varianter.csv linje {linje}: ukjent konsept «{r['konsept']}»")
        if med not in ("ja", "nei"):
            raise ValueError(f"caption_varianter.csv linje {linje}: med_arbeidssted må være «ja» eller «nei»")
        try:
            felt = {f for _, f, _, _ in string.Formatter().parse(r["mal"]) if f is not None}
        except ValueError:
            raise ValueError(f"caption_varianter.csv linje {linje}: ugyldige klammer i malen") from None
        if not felt <= PLASSHOLDERE or "navn" not in felt or SKRIV_TEMA not in r["mal"]:
            raise ValueError(f"caption_varianter.csv linje {linje}: malen må ha {{navn}} og [SKRIV TEMA], "
                             "og bare plassholderne {navn}, {yrke}, {arbeidssted}")
        if ("arbeidssted" in felt) != (med == "ja"):
            raise ValueError(f"caption_varianter.csv linje {linje}: {{arbeidssted}} skal være med bare når med_arbeidssted er «ja»")
        out.setdefault((r["konsept"], med == "ja"), []).append(r["mal"])
    return out


def velg_variant(maler, nokkel):
    """Stabil mellom kjøringer (crc32, ikke Pythons hash()): samme nøkkel gir alltid samme mal."""
    return maler[zlib.crc32(nokkel.encode("utf-8")) % len(maler)]


def les_maler(tekst):
    """Innholdet i config/caption_maler.csv → [(konsept, yrke eller '*', [hashtags])]."""
    out = []
    for linje, r in _rader(tekst, ["konsept", "yrke", "hashtags", "merknad"], "caption_maler.csv"):
        tags = r["hashtags"].split()
        if r["konsept"] not in KONSEPT_MAPPER.values():
            raise ValueError(f"caption_maler.csv linje {linje}: ukjent konsept «{r['konsept']}»")
        if not tags or any(not t.startswith("#") or len(t) < 2 for t in tags):
            raise ValueError(f"caption_maler.csv linje {linje}: hashtags må starte med #")
        out.append((r["konsept"], (r["yrke"] or "*").lower(), tags))
    return out


def hashtags_for(maler, konsept, yrke=None):
    """Felles hashtags for konseptet ('*') og så de for yrket, uten dubletter. (tags, kuttet?)"""
    tags, sett = [], set()
    for k, y, t in [m for m in maler if m[0] == konsept and m[1] == "*"] + \
                   [m for m in maler if m[0] == konsept and yrke and m[1] == yrke.lower()]:
        for tag in t:
            if tag.lower() not in sett:
                sett.add(tag.lower())
                tags.append(tag)
    return tags[:MAKS_HASHTAGS], len(tags) > MAKS_HASHTAGS


def slaa_opp_gjest(navn, gjester):
    """(Gjest, None) eller (None, melding). Krever helt likt navn; gjetter aldri."""
    g = gjester.get(nfc(navn).lower())
    if g:
        return g, None
    fornavn = nfc(navn).lower()
    like = sorted(x.navn for x in gjester.values() if x.navn.lower().split(" ")[0] == fornavn)
    if len(like) > 1:
        return None, f"Flere gjester heter {nfc(navn)} ({', '.join(like)}): bruk navnet fra listen i filnavnet"
    if like:
        return None, f"Ukjent gjest: {nfc(navn)} (listen har {like[0]})"
    return None, f"Ukjent gjest: {nfc(navn)}"


# ---------------------------------------------------------------------------
# Filnavn og skjelett
# ---------------------------------------------------------------------------

FF_RE = re.compile(r"^Veksthuset Folka Først (?P<gjest>.+?) Video (?P<nr>\d+)\.(?:mp4|mov|m4v)$", re.IGNORECASE)
GJEST_RE = re.compile(r"^[^\W\d_]+(?:[ .-][^\W\d_]*\.?)*$")
PREFIKS = {
    "På Gata": re.compile(r"^Veksthuset På Gata\s*[-–:]?\s*", re.IGNORECASE),
    "Sitcom": re.compile(r"^Veksthuset Sit-?com\s*[-–:]?\s*", re.IGNORECASE),
}
VIDEO_NR_RE = re.compile(r"\s+Video (\d+)$", re.IGNORECASE)
SITCOM_UKE_RE = re.compile(r"^(\d{1,2})\.\s+(.+)$")  # «45. Tittel»: ukenummeret først i Sitcom-filnavn
# « (N)» rett før filtypen (Drives navn på en kopi)
KOPI_NR_RE = re.compile(r"^(?P<stamme>.+) \((?P<k>\d+)\)(?P<ext>\.(?:mp4|mov|m4v))$", re.IGNORECASE)
KOPI_RE = re.compile(r"\(\d+\)$|\bkopi\b|\bcopy\b|\bv\d+$", re.IGNORECASE)


@dataclass
class Fil:
    """Én videofil tolket for drive_videos. tittel er forslaget til tittel i kalenderen."""
    konsept: str
    aar: int
    uke: int
    filnavn: str
    tolkning: str
    melding: str = ""
    tittel: str = ""
    gjest: str | None = None
    yrke: str | None = None
    videonr: int | None = None
    tema: str | None = None
    caption_skjelett: str | None = None
    merknader: list = field(default_factory=list)
    kopi_av: str | None = None  # originalnavnet når filen er en kopi som er tolket som originalen


def er_video(filnavn, mime=None):
    return (mime or "").startswith("video/") or nfc(filnavn).lower().endswith(VIDEO_ENDINGER)


def _uten_endelse(filnavn):
    for e in VIDEO_ENDINGER:
        if filnavn.lower().endswith(e):
            return filnavn[: -len(e)].strip()
    return None


def skjelett(konsept, *, gjest=None, yrke=None, tema=None, budskap=None, hashtags=(), varianter=None, nokkel=""):
    """varianter: fra les_varianter (None/tom = standardmalen). nokkel: fil-ID i Drive, ellers filnavnet."""
    linje1 = budskap or SKRIV_BUDSKAP
    tags = " ".join(hashtags)
    if konsept == "Folka Først":
        valg = (varianter or {}).get((konsept, gjest.bruk_arbeidssted))
        if valg:
            midt = velg_variant(valg, nokkel).format(navn=gjest.fornavn, yrke=yrke, arbeidssted=gjest.arbeidssted)
        else:
            sted = f" i {gjest.arbeidssted}" if gjest.bruk_arbeidssted else ""
            midt = f"{gjest.fornavn} jobber som {yrke}{sted} og snakker om {SKRIV_TEMA}!"
    elif konsept == "På Gata":
        midt = f"Vi spør folk på gata: {tema}"
    else:
        midt = SKRIV_SPORSMAL
    return f"{linje1}\n\n{midt}\n\n{tags}".rstrip()


def _ff_nokkel(filnavn):
    """(gjest, nr) for et Folka Først-navn uten kopi-merke, ellers None."""
    m = FF_RE.match(filnavn)
    return (m["gjest"].lower(), int(m["nr"])) if m else None


def kopi_hindring(filnavn, mappe_filnavn):
    """
    For en Folka Først-kopi («… Video 2 (1).mp4»): None når den kan tolkes som originalen (ingen original og bare
    én kopi for gjesten og nummeret i samme ukemappe), ellers årsaken. Uten mappeinnhold kan det ikke sjekkes.
    """
    mk = KOPI_NR_RE.match(filnavn)
    original = mk["stamme"] + mk["ext"]
    nokkel = _ff_nokkel(original)
    if mappe_filnavn is None:
        return f"Ser ut som en kopi av «{original}»; kan ikke sjekke ukemappen"
    andre = [nfc(n) for n in mappe_filnavn]
    if any(_ff_nokkel(n) == nokkel for n in andre):
        return f"Ser ut som en kopi; originalen finnes i samme mappe ({original})"
    kopier = [n for n in andre if (k := KOPI_NR_RE.match(n)) and _ff_nokkel(k["stamme"] + k["ext"]) == nokkel]
    if len(kopier) > 1:
        return f"Ser ut som en kopi; {len(kopier)} kopier av samme video i mappen ({', '.join(sorted(kopier))})"
    return None


def tolk_fil(konsept, aar, uke, filnavn, *, gjester, notater, maler, mime=None, varianter=None, fil_id=None,
             mappe_filnavn=None):
    """mappe_filnavn: alle filnavn i samme ukemappe (trengs for å tolke Folka Først-kopier)."""
    navn = nfc(filnavn)
    f = Fil(konsept, aar, uke, navn, IKKE_TOLKET)
    tolket_navn = navn
    if konsept == "Folka Først" and er_video(navn, mime):
        mk = KOPI_NR_RE.match(navn)
        if mk and FF_RE.match(mk["stamme"] + mk["ext"]):
            hindring = kopi_hindring(navn, mappe_filnavn)
            if hindring:
                f.melding = hindring
                return f
            tolket_navn = mk["stamme"] + mk["ext"]
            f.kopi_av = tolket_navn
            mo = FF_RE.match(tolket_navn)
            f.merknader.append(f"kopi tolket som «{mo['gjest']} Video {mo['nr']}» (ingen original i mappen)")
    stamme = _uten_endelse(tolket_navn)
    if stamme is None or not er_video(navn, mime):
        f.melding = "Ikke en videofil (.mp4, .mov eller .m4v)"
        return f
    if KOPI_RE.search(stamme):
        f.melding = "Ser ut som en kopi eller ekstra versjon («(1)», «kopi», «v2»)"
        return f
    notat = notater.get(navn.lower()) or notater.get(tolket_navn.lower(), {})

    if konsept == "Folka Først":
        m = FF_RE.match(tolket_navn)
        if not m:
            f.melding = "Passer ikke mønsteret «Veksthuset Folka Først <gjest> Video <nr>.mp4»"
            return f
        if not GJEST_RE.match(m["gjest"]):
            f.melding = f"Gjestenavnet «{m['gjest']}» inneholder tall eller tegn"
            return f
        f.gjest, f.videonr = m["gjest"], int(m["nr"])
        f.tittel = f"{m['gjest']} Video {f.videonr}"  # gjestenavnet slik det står i filnavnet
        g, feil = slaa_opp_gjest(m["gjest"], gjester)
        if feil:
            f.tolkning, f.melding = STOPP, feil
            return f
        f.gjest = g.navn
        f.yrke = notat.get("yrke") or g.yrke
        if notat.get("yrke"):
            f.merknader.append("yrke fra notatene")
        if not f.yrke:
            f.tolkning, f.melding = STOPP, f"Mangler yrke for {g.navn}"
            return f
        tags, kuttet = hashtags_for(maler, konsept, f.yrke)
        f.caption_skjelett = skjelett(konsept, gjest=g, yrke=f.yrke, budskap=notat.get("budskap"), hashtags=tags,
                                      varianter=varianter, nokkel=fil_id or navn)
    else:
        rest = PREFIKS[konsept].sub("", stamme)
        nr = VIDEO_NR_RE.search(rest)
        if nr:
            rest = rest[: nr.start()]
            if konsept == "På Gata":
                f.videonr = int(nr.group(1))
        if konsept == "Sitcom":
            # «45. Det ordner seg, tror jeg»: tallet er ukenummeret (ikke episode); uken avgjøres av mappen
            uke_nr = SITCOM_UKE_RE.match(rest)
            if uke_nr:
                rest = uke_nr.group(2)
                if int(uke_nr.group(1)) != uke:
                    f.merknader.append(f"Sitcom: filnavn sier uke {int(uke_nr.group(1))}, men ligger i Uke {uke}")
        rest = rest.strip(" -–:")
        if not rest:
            f.melding = "Filnavnet har ingen tittel eller tema etter prefikset"
            return f
        if konsept == "På Gata":
            f.tittel, f.tema = rest, rest
        else:
            f.tittel = rest
        tags, kuttet = hashtags_for(maler, konsept)
        f.caption_skjelett = skjelett(konsept, tema=f.tema, budskap=notat.get("budskap"), hashtags=tags)

    if notat.get("budskap"):
        f.merknader.append("budskap fra notatene")
    if kuttet:
        f.merknader.append(f"over {MAKS_HASHTAGS} hashtags, kuttet")
    if not tags:
        f.merknader.append("ingen hashtags i caption_maler.csv for konseptet")
    f.tolkning, f.melding = OK, "; ".join(f.merknader)
    return f


def marker_dubletter(filer):
    """To Folka Først-filer med samme gjest og videonummer i samme uke blir begge 'ikke tolket'."""
    nokler = {}
    for f in filer:
        if f.konsept == "Folka Først" and f.gjest and f.videonr is not None:
            nokler.setdefault((f.aar, f.uke, f.gjest.lower(), f.videonr), []).append(f)
    for (aar, uke, _, nr), like in nokler.items():
        if len(like) > 1:
            for f in like:
                f.tolkning, f.caption_skjelett = IKKE_TOLKET, None
                f.melding = f"{len(like)} filer med {like[0].gjest} Video {nr} i uke {uke}"
    return filer


def ukjente_notater(notater, filnavn):
    """Linjer i notatfilen som ikke passer noen fil i uken (sannsynligvis skrivefeil)."""
    finnes = {nfc(n).lower() for n in filnavn}
    return sorted(k for k in notater if k not in finnes)


def i_dag_oslo():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Europe/Oslo")).date()
