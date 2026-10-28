"""
NM Insights - leser mappe- og filnavn fra Google Drive og tolker dem til rader for drive_videos.

--dry-run: viser tolkningen i terminalen og skriver den til data/drive_dryrun.json. Skriver ingenting til Supabase.
--skriv:   som --dry-run, og upserter så radene til public.drive_videos (nøkkel drive_file_id) med service-nøkkelen.
           Nye filer settes inn, kjente oppdateres (forst_sett beholdes). Skriver aldri til planned_posts.
           Stopper uten å skrive noe hvis skanningen var ufullstendig (f.eks. en mappe uten tilgang).
Borte fra Drive: innboksrader som ikke ble sett, men har uke i skannevinduet, sjekkes med files.get. 404 eller
papirkurv gir finnes_i_drive = false (bare med --skriv; dry-run viser «Ville merket N»). Rader med uke utenfor
vinduet (passert eller bak horisonten) er «ikke skannet» og røres ikke. Rader slettes aldri; sees de igjen, blir de
true. Både dry-run og --skriv leser drive_videos og planned_posts (bare lesing) for denne sjekken.
Kjøres manuelt på Adrians PC, ikke i GitHub Actions: gjestelisten ligger bare lokalt. Ingen nedlasting av videoer.

Struktur: DRIVE_VEKSTHUSET_FOLDER_ID (mappen «Veksthuset») > <Konsept> > Uke NN > filer.
Tolkningen ligger i drive_tolk.py. Gjestelisten (config/gjester.csv) og notatene
(config/notater/<ÅÅÅÅ>-W<NN>.csv) ligger bare lokalt.

Kjør:  python fetch_drive.py --dry-run | --skriv [--horisont 12] [--i-dag 2026-12-30]
Krever DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN (fra drive_auth.py) og
DRIVE_VEKSTHUSET_FOLDER_ID i .env, og for --skriv SUPABASE_URL og SUPABASE_SECRET_KEY. Hemmeligheter skrives aldri ut.
"""
import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

import db
import drive_tolk as dt
from retry import retry

load_dotenv()

DRIVE_URL = "https://www.googleapis.com/drive/v3"
TOKEN_URI = "https://oauth2.googleapis.com/token"
FOLDER = "application/vnd.google-apps.folder"
FIELDS = "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,capabilities(canListChildren))"
GJESTER_FILE = Path("config/gjester.csv")
MALER_FILE = Path("config/caption_maler.csv")
VARIANTER_FILE = Path("config/caption_varianter.csv")  # valgfri; uten den brukes standardmalen
NOTATER_DIR = Path("config/notater")
DRYRUN_FILE = Path("data/drive_dryrun.json")
KONSEPT_REKKEFOLGE = ["Folka Først", "Sitcom", "På Gata"]
TABELL = "drive_videos"

# Lengdegrensene i public.drive_videos (2026-10-26_drive_kalender.sql)
GRENSER = {"mappe": 300, "filnavn": 300, "drive_lenke": 500, "tittel": 200, "gjest": 100, "yrke": 100,
           "tema": 200, "melding": 1000, "caption_skjelett": 2200}
# Feltene som avgjør om en kjent rad er endret (sist_sett, forst_sett og endret_i_drive teller ikke)
SAMMENLIGN = ("konsept", "aar", "uke", "mappe", "filnavn", "drive_lenke", "tittel", "gjest", "yrke", "videonr",
              "tema", "tolkning", "melding", "caption_skjelett", "finnes_i_drive")

# Feilårsaker fra Google som går over av seg selv
TRANSIENT_REASONS = {"backendError", "internalError", "rateLimitExceeded", "userRateLimitExceeded"}


class DriveApiError(RuntimeError):
    def __init__(self, message, status=None, transient=False):
        super().__init__(message)
        self.status = status
        self.transient = transient


def is_transient(error):
    return getattr(error, "transient", False)


class Drive:
    """Leser metadata fra Drive med refresh token fra miljøet. Tokenet ligger bare i minnet."""

    def __init__(self):
        missing = [k for k in ("DRIVE_CLIENT_ID", "DRIVE_CLIENT_SECRET", "DRIVE_REFRESH_TOKEN") if not os.getenv(k)]
        if missing:
            sys.exit(f"Mangler {', '.join(missing)} i .env-filen. Kjør python drive_auth.py først.")
        self.creds = Credentials(
            token=None,
            refresh_token=os.environ["DRIVE_REFRESH_TOKEN"],
            client_id=os.environ["DRIVE_CLIENT_ID"],
            client_secret=os.environ["DRIVE_CLIENT_SECRET"],
            token_uri=TOKEN_URI,
        )
        self._refresh()

    def _refresh(self):
        try:
            self.creds.refresh(Request())
        except Exception as e:  # meldingen fra google-auth inneholder ikke tokens
            raise DriveApiError(f"Kunne ikke fornye tilgangen: {type(e).__name__}") from None

    def _get_once(self, url, params):
        if not self.creds.valid:
            self._refresh()
        try:
            resp = requests.get(url, params=params, timeout=60,
                                headers={"Authorization": f"Bearer {self.creds.token}"})
        except requests.RequestException as e:  # meldingen kan inneholde URL, så bare typen vises
            raise DriveApiError(f"Nettverksfeil ({type(e).__name__})", transient=True) from None
        try:
            data = resp.json()
        except ValueError:
            status = resp.status_code
            raise DriveApiError(f"Ugyldig svar fra Drive (HTTP {status})", status,
                                transient=status >= 500 or status == 429) from None
        if "error" in data:
            err, status = data["error"], resp.status_code
            reasons = {e.get("reason") for e in err.get("errors", [])}
            raise DriveApiError(f"{err.get('message', 'Ukjent feil fra Drive')} (HTTP {status})", status,
                                status >= 500 or status == 429 or bool(reasons & TRANSIENT_REASONS))
        return data

    def finnes(self, file_id):
        """files.get for én fil: {id, name, trashed, mappe}, eller None ved 404. Andre feil kastes."""
        try:
            meta = self._get_once(f"{DRIVE_URL}/files/{file_id}",
                                  {"fields": "id,name,trashed,parents", "supportsAllDrives": "true"})
        except DriveApiError as e:
            if e.status == 404:
                return None
            raise
        mappe = None
        for parent in meta.get("parents") or []:
            try:
                mappe = self._get_once(f"{DRIVE_URL}/files/{parent}", {"fields": "name", "supportsAllDrives": "true"}).get("name")
            except DriveApiError as e:
                if e.status != 404:
                    raise
                mappe = "(mappe uten tilgang)"
            break
        return {**meta, "mappe": mappe}

    def get(self, file_id, fields):
        return retry(lambda: self._get_once(f"{DRIVE_URL}/files/{file_id}",
                                            {"fields": fields, "supportsAllDrives": "true"}),
                     what=f"Drive files.get {file_id}", is_transient=is_transient)

    def children(self, folder_id, what):
        """Alle filer og mapper rett under folder_id (ikke i papirkurven)."""
        out, page = [], None
        while True:
            params = {"q": f"'{folder_id}' in parents and trashed = false", "fields": FIELDS,
                      "pageSize": 1000, "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
                      "orderBy": "name"}
            if page:
                params["pageToken"] = page
            data = retry(lambda: self._get_once(f"{DRIVE_URL}/files", params), what=f"Drive {what}",
                         is_transient=is_transient)
            out.extend(data.get("files", []))
            page = data.get("nextPageToken")
            if not page:
                return out

    def assert_clean(self, obj):
        """Sikring: ingenting som skrives, skal inneholde token eller client secret."""
        text = json.dumps(obj, default=str)
        for secret in (self.creds.token, self.creds.refresh_token, self.creds.client_secret):
            if secret and secret in text:
                raise RuntimeError("Data til lagring inneholder en hemmelighet. Avbryter.")


def kan_liste(item):
    return (item.get("capabilities") or {}).get("canListChildren") is not False


def les_lokalt(path, parse, paakrevd, advarsler=None):
    """
    Leser en lokal CSV (bare lesing, skriver aldri tilbake). Med advarsler (en liste) er tegnsettet tolerant:
    UTF-8, ellers Windows-1252 med en advarsel i listen.
    """
    if not path.exists():
        if paakrevd:
            sys.exit(f"Finner ikke {path}")
        return {}
    try:
        if advarsler is None:
            return parse(path.read_text(encoding="utf-8"))
        tekst, advarsel = dt.dekod(path.read_bytes(), path.name)
        if advarsel:
            advarsler.append(advarsel)
        return parse(tekst)
    except (ValueError, UnicodeDecodeError) as e:
        sys.exit(f"{path}: {e}")


def skann(drive, root_id, i_dag, horisont, gjester, maler, advarsler=None, ufullstendig=None, varianter=None):
    """
    Går gjennom Konsept > Uke NN > filer.
    Returnerer (filer med Drive-felt, merknader, ignorerte undermapper som «Sitcom/Drafts»).
    Mapper som ikke kunne leses, legges i ufullstendig (en liste); da skal ingenting skrives.
    """
    merknader, filer, ignorert = [], [], []
    advarsler = [] if advarsler is None else advarsler
    ufullstendig = [] if ufullstendig is None else ufullstendig
    for kmappe in drive.children(root_id, "Veksthuset"):
        navn = dt.nfc(kmappe["name"])
        if kmappe["mimeType"] != FOLDER:
            merknader.append(f"Fil rett i Veksthuset-mappen, ignorert: {navn}")
            continue
        art, konsept = dt.konsept_for_mappe(navn)
        if art == "ignorert":
            continue
        if art == "ukjent":
            merknader.append(f"Ukjent mappe, ignorert: {navn}")
            continue
        if not kan_liste(kmappe):
            merknader.append(f"{konsept}: ingen tilgang til innholdet i mappen")
            ufullstendig.append(konsept)
            continue
        for umappe in drive.children(kmappe["id"], konsept):
            unavn = dt.nfc(umappe["name"])
            if umappe["mimeType"] != FOLDER:
                merknader.append(f"{konsept}: fil utenfor ukemappe, ignorert: {unavn}")
                continue
            if unavn.lower() in dt.IGNORERTE_UNDERMAPPER.get(konsept, ()):
                ignorert.append(f"{konsept}/{unavn}")
                continue
            uke, grunn = dt.tolk_uke(unavn, i_dag, horisont)
            if not uke:
                merknader.append(f"{konsept}: {grunn}")
                continue
            if not kan_liste(umappe):
                merknader.append(f"{konsept} {unavn}: ingen tilgang til innholdet i mappen")
                ufullstendig.append(f"{konsept}/{unavn}")
                continue
            aar, nr = uke
            notatfil = NOTATER_DIR / f"{dt.uke_nokkel(aar, nr)}.csv"
            notater = les_lokalt(notatfil, dt.les_notater, paakrevd=False, advarsler=advarsler)
            innhold = drive.children(umappe["id"], f"{konsept} {unavn}")
            if not innhold:
                merknader.append(f"{konsept} {unavn}: tom mappe")
            for item in innhold:
                fnavn = dt.nfc(item["name"])
                if item["mimeType"] == FOLDER:
                    merknader.append(f"{konsept} {unavn}: undermappe ignorert: {fnavn}")
                    continue
                f = dt.tolk_fil(konsept, aar, nr, fnavn, gjester=gjester, notater=notater, maler=maler,
                                mime=item.get("mimeType"), varianter=varianter, fil_id=item.get("id"),
                                mappe_filnavn=[i["name"] for i in innhold if i["mimeType"] != FOLDER])
                if f.kopi_av and f.tolkning == dt.OK:
                    kort = lambda n: re.sub(r"^Veksthuset Folka Først ", "", n, flags=re.I)  # noqa: E731
                    merknader.append(f"{konsept} {unavn}: «{kort(fnavn)}» tolket som «{kort(f.kopi_av).rsplit('.', 1)[0]}» "
                                     "(ingen original i mappen)")
                filer.append((f, item, f"{konsept}/{unavn}"))
            for ukjent in dt.ukjente_notater(notater, [i["name"] for i in innhold]):
                merknader.append(f"{notatfil}: «{ukjent}» passer ingen fil i {konsept} {unavn}")
    dt.marker_dubletter([f for f, _, _ in filer])
    return filer, merknader, ignorert


def rad(f, item, mappe):
    """Rad med samme felt som drive_videos (+ tittel til kalenderen)."""
    return {
        "drive_file_id": item["id"], "konsept": f.konsept, "aar": f.aar, "uke": f.uke, "mappe": mappe,
        "filnavn": f.filnavn, "drive_lenke": item.get("webViewLink"), "tittel": f.tittel or None,
        "gjest": f.gjest, "yrke": f.yrke, "videonr": f.videonr, "tema": f.tema, "tolkning": f.tolkning,
        "melding": f.melding, "caption_skjelett": f.caption_skjelett, "finnes_i_drive": True,
        "endret_i_drive": item.get("modifiedTime"),
    }


def til_db(r, naa):
    """
    Rad fra rad() → rad til drive_videos: tom streng blir null (unntatt melding, som er NOT NULL med standard ''),
    lengdegrensene holdes, og en ok-rad uten gyldig tittel eller skjelett blir «ikke tolket» (tabellen krever dem).
    forst_sett er aldri med, så den settes bare ved innsetting.
    """
    out = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in r.items()}
    meldinger = [out["melding"]] if out.get("melding") else []
    if out["tolkning"] == dt.OK:
        feil = []
        for felt, navn in (("tittel", "Tittelen"), ("caption_skjelett", "Skjelettet")):
            if not out.get(felt):
                feil.append(f"{navn} mangler")
            elif len(out[felt]) > GRENSER[felt]:
                feil.append(f"{navn} er lengre enn {GRENSER[felt]} tegn")
        if feil:
            out["tolkning"] = dt.IKKE_TOLKET
            meldinger += feil
    for felt in ("tittel", "caption_skjelett", "drive_lenke"):  # avkortet er verre enn ingenting
        if out.get(felt) and len(out[felt]) > GRENSER[felt]:
            out[felt] = None
    for felt in ("mappe", "filnavn", "gjest", "yrke", "tema"):
        if out.get(felt) and len(out[felt]) > GRENSER[felt]:
            out[felt] = out[felt][: GRENSER[felt] - 1] + "…"
    melding = "; ".join(meldinger)
    out["melding"] = melding if len(melding) <= GRENSER["melding"] else melding[: GRENSER["melding"] - 1] + "…"
    out["finnes_i_drive"] = True
    out["sist_sett"] = naa
    out.pop("forst_sett", None)
    return out


def skriv_innboks(rader, ufullstendig, klient=db, naa=None):
    """
    Upserter radene til drive_videos. Returnerer tellingen {ny, oppdatert, uendret, stopp, ikke tolket}.
    Stopper (SystemExit) uten å skrive noe når skanningen var ufullstendig. Rører aldri planned_posts.
    """
    if ufullstendig:
        sys.exit(f"Skanningen av Drive er ufullstendig (ingen tilgang: {', '.join(ufullstendig)}). "
                 "Ingenting er skrevet til databasen.")
    naa = naa or datetime.now(timezone.utc).isoformat(timespec="seconds")
    ut = [til_db(r, naa) for r in rader]
    ider = [r["drive_file_id"] for r in ut]
    if len(set(ider)) != len(ider):
        sys.exit("Samme Drive-fil forekommer to ganger i skanningen. Ingenting er skrevet til databasen.")
    finnes = {r["drive_file_id"]: r for r in klient.select(TABELL, {
        "select": ",".join(("drive_file_id",) + SAMMENLIGN), "order": "drive_file_id"})}
    teller = {"ny": 0, "oppdatert": 0, "uendret": 0}
    for r in ut:
        gammel = finnes.get(r["drive_file_id"])
        if gammel is None:
            teller["ny"] += 1
        elif any(gammel.get(k) != r.get(k) for k in SAMMENLIGN):
            teller["oppdatert"] += 1
        else:
            teller["uendret"] += 1
    if ut:
        klient.upsert(TABELL, ut, on_conflict="drive_file_id")
    teller["stopp"] = sum(r["tolkning"] == dt.STOPP for r in ut)
    teller["ikke tolket"] = sum(r["tolkning"] == dt.IKKE_TOLKET for r in ut)
    return teller


GYLDIG_ID = re.compile(r"^[A-Za-z0-9_-]{10,200}$")


def sjekk_borte(drive, klient, rader, i_dag, horisont):
    """
    Leser innboksen og kalenderens Drive-koblinger (bare lesing) og sjekker radene som ikke ble sett.
    Returnerer {borte: [(rad, grunn)], annet_sted: [(rad, mappe)], ikke_skannet: int, i_kalenderen: set, vindu}.
    Andre feil fra files.get enn 404 kastes (DriveApiError): da er skanningen ufullstendig.
    """
    vindu = dt.skannevindu(i_dag, horisont)
    db_rader = klient.select(TABELL, {"select": "drive_file_id,konsept,aar,uke,filnavn,tittel,gjest,videonr,finnes_i_drive",
                                      "order": "drive_file_id"})
    i_kal = {r["drive_file_id"] for r in klient.select("planned_posts", {"select": "drive_file_id",
                                                                          "drive_file_id": "not.is.null",
                                                                          "order": "drive_file_id"}, schema="dashboard")}
    sjekkes, ikke_skannet = dt.del_usette(db_rader, {r["drive_file_id"] for r in rader}, vindu)
    borte, annet_sted = [], []
    for r in sjekkes:
        meta = drive.finnes(r["drive_file_id"])
        utfall, grunn = dt.vurder(meta)
        if utfall == "borte":
            borte.append((r, grunn))
        else:
            annet_sted.append((r, meta.get("mappe") or "ukjent mappe"))
    return {"borte": borte, "annet_sted": annet_sted, "ikke_skannet": len(ikke_skannet), "i_kalenderen": i_kal,
            "vindu": vindu, "allerede_borte": sum(r.get("finnes_i_drive") is False for r in db_rader)}


def marker_borte(borte, klient=db):
    """Setter finnes_i_drive = false for radene (aldri sletting). Returnerer antallet."""
    ider = [r["drive_file_id"] for r, _ in borte]
    if not ider:
        return 0
    if not all(GYLDIG_ID.match(i) for i in ider):
        sys.exit("Ugyldig fil-ID blant radene som skulle merkes. Ingenting er merket.")
    klient.update(TABELL, {"drive_file_id": f"in.({','.join(ider)})"}, {"finnes_i_drive": False})
    return len(ider)


def vis_borte(s, modus):
    (a1, u1), (a2, u2) = s["vindu"]
    verb = "Merket" if modus == "skriv" else "Ville merket"
    print(f"\n{verb} {len(s['borte'])} som borte fra Drive (finnes_i_drive = false)"
          + ("." if not s["borte"] else ":"))
    for r, grunn in sorted(s["borte"], key=lambda x: (x[0]["aar"], x[0]["uke"], x[0]["konsept"], x[0]["drive_file_id"])):
        kal = " (ligger i kalenderen)" if r["drive_file_id"] in s["i_kalenderen"] else ""
        print(f"  {dt.rad_navn(r)}: borte ({grunn}){kal}")
    print(f"Ikke skannet (uke utenfor uke {u1} {a1} – uke {u2} {a2}, røres ikke): {s['ikke_skannet']}")
    if s["annet_sted"]:
        print("Finnes i Drive, men utenfor skannet område (røres ikke):")
        for r, mappe in s["annet_sted"]:
            print(f"  {dt.rad_navn(r)}: ligger i «{mappe}»")
    if s["allerede_borte"]:
        print(f"Allerede merket borte fra før: {s['allerede_borte']}")


def oppdater_innboks(drive, rader, ufullstendig, i_dag, horisont, skriv, klient=db, naa=None):
    """
    Sjekk av borte filer og (med skriv) skriving. Alt leses og sjekkes før noe skrives: ufullstendig skanning eller
    feil fra files.get stopper uten å skrive. Rører aldri planned_posts (bare lesing av Drive-koblingene).
    """
    if ufullstendig:
        if skriv:
            sys.exit(f"Skanningen av Drive er ufullstendig (ingen tilgang: {', '.join(ufullstendig)}). "
                     "Ingenting er skrevet til databasen.")
        print(f"\nSkanningen er ufullstendig (ingen tilgang: {', '.join(ufullstendig)}); sjekken av borte filer er hoppet over.")
        return None
    try:
        s = sjekk_borte(drive, klient, rader, i_dag, horisont)
    except DriveApiError as e:
        if skriv:
            sys.exit(f"Skanningen er ufullstendig (files.get feilet: {e}). Ingenting er skrevet til databasen.")
        print(f"\nSkanningen er ufullstendig (files.get feilet: {e}); sjekken av borte filer er avbrutt.")
        return None
    if skriv:
        s["skrevet"] = skriv_innboks(rader, [], klient=klient, naa=naa)
        s["merket"] = marker_borte(s["borte"], klient)
    vis_borte(s, "skriv" if skriv else "dry-run")
    return s


def kort_feil(e):
    """Statuskode og kort melding fra en Supabase-feil, uten «details» (som kan inneholde hele raden)."""
    tekst = str(e)
    m = re.match(r"Supabase svarte (\d+): (.*)", tekst, re.S)
    if not m:
        return tekst[:200]
    status, body = m.groups()
    kode = re.search(r'"code"\s*:\s*"([^"]{1,20})"', body)
    melding = re.search(r'"message"\s*:\s*"([^"]{1,200})', body)
    return (f"Supabase svarte {status}" + (f" ({kode.group(1)})" if kode else "")
            + (f": {melding.group(1)}" if melding else ""))


def vis(rader, merknader, i_dag, horisont, ignorert=(), advarsler=(), modus="dry-run"):
    aar, uke, _ = i_dag.isocalendar()
    print(f"\nDrive-tolkning ({modus}) {i_dag:%d.%m.%Y}, uke {uke} {aar}, horisont {horisont} uker\n")
    nokler = sorted({(r["aar"], r["uke"]) for r in rader})
    for a, u in nokler:
        uke_rader = [r for r in rader if (r["aar"], r["uke"]) == (a, u)]
        ok = [r for r in uke_rader if r["tolkning"] == dt.OK]
        miks = ", ".join(f"{sum(r['konsept'] == k for r in ok)} {k}" for k in KONSEPT_REKKEFOLGE)
        print(f"=== {dt.uke_nokkel(a, u)}  (ok: {miks})")
        for k in KONSEPT_REKKEFOLGE:
            for r in sorted((r for r in uke_rader if r["konsept"] == k), key=lambda r: r["filnavn"]):
                merke = {"ok": "OK   ", "stopp": "STOPP", "ikke tolket": "IKKE "}[r["tolkning"]]
                print(f"  [{merke}] {k}: {r['filnavn']}")
                if r["melding"]:
                    print(f"           {r['melding']}")
                if r["caption_skjelett"]:
                    for linje in r["caption_skjelett"].split("\n"):
                        print(f"           | {linje}")
        print()
    if not nokler:
        print("Ingen ukemapper innenfor horisonten.\n")
    if advarsler:
        print("Advarsler:")
        for a in advarsler:
            print(f"  ! {a}")
    if merknader:
        print("Merknader:")
        for m in merknader:
            print(f"  - {m}")
    teller = {t: sum(r["tolkning"] == t for r in rader) for t in (dt.OK, dt.STOPP, dt.IKKE_TOLKET)}
    print(f"\nTotalt: {len(rader)} filer, {teller['ok']} ok, {teller['stopp']} stopp, "
          f"{teller['ikke tolket']} ikke tolket."
          + (" Ingenting er skrevet til databasen." if modus == "dry-run" else ""))
    if ignorert:
        print(f"Hoppet over: {', '.join(ignorert)}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    modus = p.add_mutually_exclusive_group()
    modus.add_argument("--dry-run", action="store_true", help="vis tolkningen uten å skrive til databasen")
    modus.add_argument("--skriv", action="store_true", help="vis tolkningen og skriv den til public.drive_videos")
    p.add_argument("--horisont", type=int, default=dt.HORISONT_UKER, help="uker frem (standard 12)")
    p.add_argument("--i-dag", type=date.fromisoformat, help="dagens dato for uketolkningen (test)")
    args = p.parse_args(argv)
    if not args.dry_run and not args.skriv:
        p.print_help()
        sys.exit(2)
    if args.horisont < 0:
        sys.exit("--horisont må være 0 eller mer")

    root = os.getenv("DRIVE_VEKSTHUSET_FOLDER_ID")
    if not root:
        sys.exit("Mangler DRIVE_VEKSTHUSET_FOLDER_ID i .env-filen (ID-en til mappen «Veksthuset»).")
    advarsler = []
    gjester = les_lokalt(GJESTER_FILE, dt.les_gjester, paakrevd=True, advarsler=advarsler)
    maler = les_lokalt(MALER_FILE, dt.les_maler, paakrevd=True)
    varianter = les_lokalt(VARIANTER_FILE, dt.les_varianter, paakrevd=False)
    i_dag = args.i_dag or dt.i_dag_oslo()

    drive = Drive()
    meta = drive.get(root, "name,capabilities(canListChildren)")
    if not kan_liste(meta):
        sys.exit(f"Ingen tilgang til innholdet i mappen «{meta.get('name')}».")
    ufullstendig = []
    filer, merknader, ignorert = skann(drive, root, i_dag, args.horisont, gjester, maler, advarsler, ufullstendig,
                                       varianter)
    rader = [rad(*x) for x in filer]
    drive.assert_clean(rader)

    vis(rader, merknader, i_dag, args.horisont, ignorert, advarsler, "skriv" if args.skriv else "dry-run")
    DRYRUN_FILE.parent.mkdir(exist_ok=True)
    DRYRUN_FILE.write_text(json.dumps({"i_dag": i_dag.isoformat(), "horisont": args.horisont, "rader": rader,
                                       "merknader": merknader, "hoppet_over": ignorert, "advarsler": advarsler},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Skrev {DRYRUN_FILE} (lokal, gitignored).")

    if not db.URL or not db.KEY:
        if args.skriv:
            sys.exit("Mangler SUPABASE_URL eller SUPABASE_SECRET_KEY i .env-filen. Ingenting er skrevet.")
        print("\nMangler Supabase-nøklene: sjekken av filer som er borte fra Drive er hoppet over.")
        return
    try:
        s = oppdater_innboks(drive, rader, ufullstendig, i_dag, args.horisont, args.skriv)
    except db.SupabaseError as e:
        sys.exit(f"{kort_feil(e)}. Kjør på nytt etter rettingen (skrivingen kan trygt gjentas).")
    except requests.RequestException as e:  # meldingen kan inneholde URL, så bare typen vises
        sys.exit(f"Nettverksfeil mot Supabase ({type(e).__name__}).")
    if args.skriv and s:
        t = s["skrevet"]
        print(f"\nSkrev til {TABELL}: {t['ny']} nye, {t['oppdatert']} oppdaterte, {t['uendret']} uendrede "
              f"({t['stopp']} stopp, {t['ikke tolket']} ikke tolket), {s['merket']} merket borte. planned_posts er ikke rørt.")


if __name__ == "__main__":
    main()
