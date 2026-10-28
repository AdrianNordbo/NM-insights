"""
Tester for drive_tolk.py: uketolkning (også årsskiftet, med fast dagens dato), filnavn, NFC, gjestestopp,
notater, hashtags og caption-skjelett. Ingen nettverk og ingen ekte gjesteliste. Kjør:  python -m unittest -v
"""
import unicodedata
import unittest
from datetime import date
from pathlib import Path

import drive_tolk as dt

GJESTER = dt.les_gjester(
    "navn;yrke;arbeidssted;bruk_arbeidssted\n"
    "Christian;regnskapsfører;Eksempel Økonomi;nei\n"
    "Vibeke;rekrutterer;Eksempel AS;ja\n"
    "Line H;;Eksempel A;nei\n"
    "Line K;rådgiver;Eksempel B;nei\n"
    "Kari;;Eksempel C;nei\n"
)
MALER = dt.les_maler(Path("config/caption_maler.csv").read_text(encoding="utf-8"))


def tolk(konsept, filnavn, notater=None, gjester=GJESTER):
    return dt.tolk_fil(konsept, 2026, 45, filnavn, gjester=gjester, notater=notater or {}, maler=MALER)


class Uke(unittest.TestCase):
    def check(self, i_dag, mappe, forventet, horisont=dt.HORISONT_UKER):
        uke, grunn = dt.tolk_uke(mappe, i_dag, horisont)
        self.assertEqual(uke, forventet, grunn)
        return grunn

    def test_fremover_fra_inneverende_uke(self):
        i_dag = date(2026, 10, 26)  # mandag i uke 44
        self.check(i_dag, "Uke 44", (2026, 44))
        self.check(i_dag, "Uke 51", (2026, 51))
        self.assertIn("ignorert", self.check(i_dag, "Uke 43", None))  # passert → neste år, utenfor horisonten

    def test_samme_uke_hele_uken(self):
        self.check(date(2026, 11, 1), "Uke 44", (2026, 44))  # søndag i uke 44

    def test_horisonten_er_12_uker_og_kan_endres(self):
        i_dag = date(2026, 9, 21)  # uke 39
        self.check(i_dag, "Uke 51", (2026, 51))               # 12 uker frem
        self.assertIn("13 uker frem", self.check(i_dag, "Uke 52", None))
        self.check(i_dag, "Uke 51", None, horisont=8)
        self.assertEqual(dt.HORISONT_UKER, 12)

    def test_arsskiftet(self):
        nyttaarsaften = date(2026, 12, 30)  # uke 53 i 2026
        self.check(nyttaarsaften, "Uke 53", (2026, 53))
        self.check(nyttaarsaften, "Uke 1", (2027, 1))
        self.check(nyttaarsaften, "Uke 2", (2027, 2))
        self.check(nyttaarsaften, "Uke 52", None)
        self.check(date(2026, 12, 21), "Uke 2", (2027, 2))   # uke 52 → uke 2 neste år
        grunn = self.check(date(2027, 1, 4), "Uke 53", None)  # 2027 har ikke uke 53
        self.assertIn("har ikke uke 53", grunn)
        self.check(date(2027, 1, 4), "Uke 1", (2027, 1))

    def test_skrivemaater(self):
        i_dag = date(2026, 10, 26)
        for navn in ("Uke 45", "uke 45", "UKE  45", "Uke45", " Uke 045 "):
            self.check(i_dag, navn, (2026, 45))
        self.check(date(2027, 2, 1), "Uke 07", (2027, 7))
        for navn in ("Uke 45 og 46", "Uke", "Uke 0", "Uke 54", "Oktober"):
            self.check(i_dag, navn, None)

    def test_eksplisitt_aar(self):
        okt = date(2026, 10, 26)  # uke 44
        self.check(okt, "27 - Uke 1", (2027, 1))                      # 10 uker frem
        self.check(okt, "27-uke 01", (2027, 1))
        self.assertIn("«27 - Uke 9» er 2027-W09, 18 uker frem", self.check(okt, "27 - Uke 9", None))
        self.check(okt, "26 - Uke 44", (2026, 44))                    # inneværende uke er med
        self.check(okt, "26 - Uke 51", (2026, 51))
        self.assertIn("2026-W43 er passert", self.check(okt, "26 - Uke 43", None))
        self.assertIn("2027 har ikke uke 53", self.check(date(2026, 12, 30), "27 - Uke 53", None))
        self.check(date(2026, 12, 30), "26 - Uke 53", (2026, 53))
        # Eksplisitt år regnes ikke fremover: «26 - Uke 2» i desember 2026 er passert, ikke 2027
        self.assertIn("passert", self.check(date(2026, 12, 21), "26 - Uke 2", None))
        self.check(okt, "27 - Uke 1", None, horisont=8)

    def test_nokkel(self):
        self.assertEqual(dt.uke_nokkel(2027, 2), "2027-W02")


class Mapper(unittest.TestCase):
    def test_konsepter_og_ignorerte(self):
        self.assertEqual(dt.konsept_for_mappe("Folka Først"), ("konsept", "Folka Først"))
        self.assertEqual(dt.konsept_for_mappe(unicodedata.normalize("NFD", "På Gata")), ("konsept", "På Gata"))
        self.assertEqual(dt.konsept_for_mappe("Sit-com"), ("konsept", "Sitcom"))
        for navn in ("Uten Kompetanse", "VM-innhold", "Teasere"):
            self.assertEqual(dt.konsept_for_mappe(navn), ("ignorert", None))
        self.assertEqual(dt.konsept_for_mappe("Diverse"), ("ukjent", None))


class FolkaForst(unittest.TestCase):
    def test_gjest_og_videonummer(self):
        f = tolk("Folka Først", "Veksthuset Folka Først Christian Video 11.mp4")
        self.assertEqual((f.tolkning, f.gjest, f.yrke, f.videonr), ("ok", "Christian", "regnskapsfører", 11))
        self.assertEqual(f.tittel, "Christian Video 11")
        self.assertEqual(
            f.caption_skjelett,
            "[SKRIV BUDSKAP]\n\nChristian jobber som regnskapsfører og snakker om [SKRIV TEMA]!\n\n"
            "#podkast #norskepodkaster #arbeidslivet #oppstartsbedrift #grunder",
        )

    def test_nfc_store_smaa_bokstaver_og_endelser(self):
        nfd = unicodedata.normalize("NFD", "Veksthuset Folka Først Christian Video 11.MOV")
        f = tolk("Folka Først", nfd)
        self.assertEqual(f.tolkning, "ok")
        self.assertEqual(f.filnavn, "Veksthuset Folka Først Christian Video 11.MOV")
        self.assertTrue(unicodedata.is_normalized("NFC", f.filnavn))
        self.assertEqual(tolk("Folka Først", "veksthuset folka først  christian video 3.m4v").gjest, "Christian")

    def test_arbeidssted_bare_naar_ja(self):
        f = tolk("Folka Først", "Veksthuset Folka Først Vibeke Video 1.mp4")
        self.assertIn("Vibeke jobber som rekrutterer i Eksempel AS og snakker om [SKRIV TEMA]!", f.caption_skjelett)
        self.assertNotIn("Eksempel Økonomi", tolk("Folka Først", "Veksthuset Folka Først Christian Video 1.mp4").caption_skjelett)

    def test_ukjent_gjest_stopper(self):
        f = tolk("Folka Først", "Veksthuset Folka Først Ola Video 2.mp4")
        self.assertEqual((f.tolkning, f.melding, f.caption_skjelett), ("stopp", "Ukjent gjest: Ola", None))

    def test_tomt_yrke_stopper_uten_aa_gjette(self):
        f = tolk("Folka Først", "Veksthuset Folka Først Kari Video 2.mp4")
        self.assertEqual((f.tolkning, f.melding), ("stopp", "Mangler yrke for Kari"))
        self.assertIsNone(f.caption_skjelett)

    def test_samme_fornavn(self):
        f = tolk("Folka Først", "Veksthuset Folka Først Line Video 4.mp4")
        self.assertEqual(f.tolkning, "stopp")
        self.assertTrue(f.melding.startswith("Flere gjester heter Line (Line H, Line K)"))
        ok = tolk("Folka Først", "Veksthuset Folka Først Line K Video 4.mp4")
        self.assertEqual((ok.tolkning, ok.gjest), ("ok", "Line K"))
        self.assertIn("\n\nLine jobber som rådgiver", ok.caption_skjelett)  # bare fornavnet i captionen
        self.assertEqual(tolk("Folka Først", "Veksthuset Folka Først Line H Video 4.mp4").melding, "Mangler yrke for Line H")

    def test_eneste_med_fornavnet_er_likevel_ukjent(self):
        gjester = dt.les_gjester("navn;yrke;arbeidssted;bruk_arbeidssted\nLine H;advokat;X;nei\n")
        f = tolk("Folka Først", "Veksthuset Folka Først Line Video 4.mp4", gjester=gjester)
        self.assertEqual((f.tolkning, f.melding), ("stopp", "Ukjent gjest: Line (listen har Line H)"))

    def test_notater_overstyrer_yrke_og_gir_budskap(self):
        notater = dt.les_notater(
            "fil;yrke;budskap\nVeksthuset Folka Først Kari Video 2.mp4;daglig leder;Hva er frihet?\n"
        )
        f = tolk("Folka Først", "Veksthuset Folka Først Kari Video 2.mp4", notater)
        self.assertEqual((f.tolkning, f.yrke), ("ok", "daglig leder"))
        self.assertTrue(f.caption_skjelett.startswith("Hva er frihet?\n\nKari jobber som daglig leder og snakker om [SKRIV TEMA]!"))
        self.assertEqual(f.melding, "yrke fra notatene; budskap fra notatene")
        # Gjelder bare den ene videoen
        self.assertEqual(tolk("Folka Først", "Veksthuset Folka Først Kari Video 3.mp4", notater).tolkning, "stopp")

    def test_ikke_tolket(self):
        for navn, grunn in [
            ("Veksthuset Folka Først Christian.mp4", "Passer ikke mønsteret"),
            ("Veksthuset Folka Først Christian Video 11 (1).mp4", "kan ikke sjekke ukemappen"),  # uten mappeinnhold
            ("Veksthuset Folka Først Christian Video 11 kopi.mp4", "kopi"),
            ("Folka Først Christian Video 11.mp4", "Passer ikke mønsteret"),
            ("Veksthuset Folka Først Christian2 Video 11.mp4", "tall eller tegn"),
            ("Veksthuset Folka Først Christian Video 11.png", "Ikke en videofil"),
        ]:
            f = tolk("Folka Først", navn)
            self.assertEqual(f.tolkning, "ikke tolket", navn)
            self.assertIn(grunn, f.melding, navn)

    def test_dubletter_i_samme_uke(self):
        a = tolk("Folka Først", "Veksthuset Folka Først Christian Video 11.mp4")
        b = tolk("Folka Først", "Veksthuset Folka Først Christian Video 11.mov")
        c = tolk("Folka Først", "Veksthuset Folka Først Christian Video 12.mp4")
        dt.marker_dubletter([a, b, c])
        self.assertEqual([x.tolkning for x in (a, b, c)], ["ikke tolket", "ikke tolket", "ok"])
        self.assertEqual(a.melding, "2 filer med Christian Video 11 i uke 45")


class PaaGataOgSitcom(unittest.TestCase):
    def test_paa_gata_tema_fra_filnavnet(self):
        for navn in ("Veksthuset På Gata Dyreste impulskjøp Video 3.mp4", "Dyreste impulskjøp.mp4",
                     "Veksthuset På Gata - Dyreste impulskjøp.mov"):
            f = tolk("På Gata", navn)
            self.assertEqual((f.tolkning, f.tema), ("ok", "Dyreste impulskjøp"), navn)
        self.assertEqual(
            f.caption_skjelett,
            "[SKRIV BUDSKAP]\n\nVi spør folk på gata: Dyreste impulskjøp\n\n#PåGata #Økonomi #ViralNorge",
        )
        self.assertNotIn("#podkast", f.caption_skjelett)
        self.assertEqual(tolk("På Gata", "Veksthuset På Gata.mp4").tolkning, "ikke tolket")

    def test_sitcom_enkel_mal_uten_gjesteliste(self):
        f = tolk("Sitcom", "Veksthuset Sitcom Ståpult Video 2.mp4", gjester={})
        self.assertEqual((f.tolkning, f.tittel, f.gjest, f.tema), ("ok", "Ståpult", None, None))
        self.assertIsNone(f.videonr)
        self.assertEqual(f.caption_skjelett,
                         "[SKRIV BUDSKAP]\n\n[SKRIV SPØRSMÅL TIL FØLGERNE]\n\n#sitcom #humor #norskhumor")
        self.assertEqual(tolk("Sitcom", "Sitcom kaffemaskinen v2.mp4").tolkning, "ikke tolket")
        self.assertEqual(tolk("Sitcom", "Veksthuset Sit-com Kaffe.mp4").tittel, "Kaffe")


class SitcomUkenummer(unittest.TestCase):
    def sitcom(self, filnavn, uke=45):
        # Tom gjesteliste: navn i Sitcom-filer slås aldri opp
        return dt.tolk_fil("Sitcom", 2026, uke, filnavn, gjester={}, notater={}, maler=MALER)

    def test_ukenummer_fjernes_og_er_ikke_videonr(self):
        f = self.sitcom("45. Det ordner seg, tror jeg.mp4")
        self.assertEqual((f.tolkning, f.tittel, f.videonr, f.gjest, f.melding),
                         ("ok", "Det ordner seg, tror jeg", None, None, ""))

    def test_punktum_i_tittelen_beholdes(self):
        f = self.sitcom("47. Markus babler, igjen....mp4", uke=47)
        self.assertEqual((f.tolkning, f.tittel, f.gjest), ("ok", "Markus babler, igjen...", None))

    def test_annet_nummer_enn_ukemappen_gir_merknad_men_ok(self):
        f = self.sitcom("46. Det ordner seg, tror jeg.mp4", uke=45)
        self.assertEqual((f.tolkning, f.uke, f.tittel), ("ok", 45, "Det ordner seg, tror jeg"))
        self.assertEqual(f.melding, "Sitcom: filnavn sier uke 46, men ligger i Uke 45")
        self.assertIsNotNone(f.caption_skjelett)

    def test_uten_nummerprefiks(self):
        for navn, tittel in (("Det ordner seg.mp4", "Det ordner seg"), ("45 grader i skyggen.mp4", "45 grader i skyggen"),
                             ("Markus babler, igjen....mov", "Markus babler, igjen...")):
            f = self.sitcom(navn)
            self.assertEqual((f.tolkning, f.tittel, f.melding), ("ok", tittel, ""), navn)

    def test_nfd_og_skjelett(self):
        f = self.sitcom(unicodedata.normalize("NFD", "45. Kaffe på kontoret.mp4"))
        self.assertEqual(f.tittel, "Kaffe på kontoret")
        self.assertEqual(f.caption_skjelett, "[SKRIV BUDSKAP]\n\n[SKRIV SPØRSMÅL TIL FØLGERNE]\n\n#sitcom #humor #norskhumor")


class ListerOgMaler(unittest.TestCase):
    def test_podkast_bare_for_folka_forst(self):
        self.assertEqual(dt.hashtags_for(MALER, "Folka Først")[0][0], "#podkast")
        for k in ("Sitcom", "På Gata"):
            self.assertNotIn("#podkast", [t.lower() for t in dt.hashtags_for(MALER, k)[0]])

    def test_maks_fem_hashtags_uten_dubletter(self):
        maler = dt.les_maler("konsept;yrke;hashtags;merknad\nSitcom;*;#a #b #c;x\nSitcom;lege;#B #d #e #f;x\n")
        self.assertEqual(dt.hashtags_for(maler, "Sitcom", "Lege"), (["#a", "#b", "#c", "#d", "#e"], True))

    def test_ugyldige_lister(self):
        hode = "navn;yrke;arbeidssted;bruk_arbeidssted\n"
        for tekst in (hode + "Ola;lege;X;kanskje\n", hode + "Ola;lege;X;nei\nola;lege;Y;nei\n",
                      hode + "Ola;lege;;ja\n", "navn;yrke\nOla;lege\n"):
            with self.assertRaises(ValueError):
                dt.les_gjester(tekst)
        with self.assertRaises(ValueError):
            dt.les_maler("konsept;yrke;hashtags;merknad\nSitcom;*;sitcom;x\n")

    def test_bom_og_nfd_i_listen(self):
        tekst = "﻿navn;yrke;arbeidssted;bruk_arbeidssted\n" + unicodedata.normalize("NFD", "Bjørn Å;lærer;Skole;nei\n")
        self.assertEqual(dt.les_gjester(tekst)["bjørn å"].navn, "Bjørn Å")

    def test_tegnsett_utf8_bom_og_windows_1252(self):
        tekst = ("navn;yrke;arbeidssted;bruk_arbeidssted\n"
                 "Christian;regnskapsfører;Eika Økonomi Øst;ja\n"
                 "Kristin;avdelingsbanksjef;Trøgstad Sparebank;ja\n"
                 "Line;rådgiver;Navigatio;nei\n")
        for koding, advarsel in (("utf-8", False), ("utf-8-sig", False), ("cp1252", True)):
            data = tekst.encode(koding)
            dekodet, melding = dt.dekod(data, "gjester.csv")
            self.assertEqual(melding is not None, advarsel, koding)
            g = dt.les_gjester(dekodet)
            self.assertEqual((g["christian"].yrke, g["christian"].arbeidssted), ("regnskapsfører", "Eika Økonomi Øst"), koding)
            self.assertEqual(g["kristin"].arbeidssted, "Trøgstad Sparebank", koding)
            self.assertEqual(g["line"].yrke, "rådgiver", koding)
        self.assertEqual(dt.dekod(tekst.encode("cp1252"), "gjester.csv")[1],
                         "gjester.csv er ikke UTF-8 (lest som Windows-1252); lagre den gjerne på nytt som UTF-8")
        notat = "fil;yrke;budskap\nVeksthuset Folka Først Line Video 1.mp4;;Hvorfor søke jobb?\n"
        n = dt.les_notater(dt.dekod(notat.encode("cp1252"), "2026-W45.csv")[0])
        self.assertEqual(n["veksthuset folka først line video 1.mp4"]["budskap"], "Hvorfor søke jobb?")

    def test_fil_som_verken_er_utf8_eller_windows_1252(self):
        with self.assertRaises(ValueError):
            dt.dekod(b"navn\x81\xff", "gjester.csv")

    def test_arbeidssted_ja_og_nei(self):
        hode = "navn;yrke;arbeidssted;bruk_arbeidssted\n"
        for bruk, linje in (
            ("ja", "Christian jobber som regnskapsfører i Eika Økonomi Øst og snakker om [SKRIV TEMA]!"),
            ("nei", "Christian jobber som regnskapsfører og snakker om [SKRIV TEMA]!"),
        ):
            g = dt.les_gjester(hode + f"Christian;regnskapsfører;Eika Økonomi Øst;{bruk}\n")
            f = tolk("Folka Først", "Veksthuset Folka Først Christian Video 11.mp4", gjester=g)
            self.assertEqual(f.caption_skjelett.split("\n\n")[1], linje)

    def test_ukjente_notater(self):
        notater = dt.les_notater("fil;yrke;budskap\nFinnes ikke.mp4;;x\nA.mp4;;y\n")
        self.assertEqual(dt.ukjente_notater(notater, ["A.mp4"]), ["finnes ikke.mp4"])


class Kopier(unittest.TestCase):
    """Folka Først-filer med « (N)» før filtypen (Drives navn på en kopi)."""

    def kopi(self, navn, mappe, konsept="Folka Først"):
        return dt.tolk_fil(konsept, 2026, 45, navn, gjester=GJESTER, notater={}, maler=MALER, mappe_filnavn=mappe)

    def test_kopi_uten_original_tolkes_som_originalen(self):
        navn = "Veksthuset Folka Først Vibeke Video 2 (1).mp4"
        f = self.kopi(navn, [navn, "Veksthuset Folka Først Christian Video 3.mp4"])
        self.assertEqual((f.tolkning, f.gjest, f.videonr, f.tittel, f.filnavn), ("ok", "Vibeke", 2, "Vibeke Video 2", navn))
        self.assertEqual(f.kopi_av, "Veksthuset Folka Først Vibeke Video 2.mp4")
        self.assertEqual(f.melding, "kopi tolket som «Vibeke Video 2» (ingen original i mappen)")
        self.assertNotIn("(1)", f.tittel)
        self.assertNotIn("(1)", f.caption_skjelett)
        vanlig = self.kopi("Veksthuset Folka Først Vibeke Video 2.mp4", ["Veksthuset Folka Først Vibeke Video 2.mp4"])
        self.assertEqual(f.caption_skjelett, vanlig.caption_skjelett)

    def test_kopi_med_original_er_ikke_tolket(self):
        navn = "Veksthuset Folka Først Vibeke Video 2 (1).mp4"
        for original in ("Veksthuset Folka Først Vibeke Video 2.mp4", "Veksthuset Folka Først Vibeke Video 2.mov"):
            f = self.kopi(navn, [navn, original])
            self.assertEqual(f.tolkning, "ikke tolket", original)
            self.assertIn("originalen finnes i samme mappe", f.melding)

    def test_flere_kopier_er_ikke_tolket(self):
        a, b = "Veksthuset Folka Først Vibeke Video 2 (1).mp4", "Veksthuset Folka Først Vibeke Video 2 (2).mp4"
        for navn in (a, b):
            f = self.kopi(navn, [a, b])
            self.assertEqual(f.tolkning, "ikke tolket")
            self.assertIn("2 kopier av samme video i mappen", f.melding)
        # Kopier av ulike videoer i samme mappe hindrer ikke hverandre
        c = "Veksthuset Folka Først Vibeke Video 3 (1).mp4"
        self.assertEqual(self.kopi(c, [a, c]).tolkning, "ok")

    def test_nfc(self):
        nfd = unicodedata.normalize("NFD", "Veksthuset Folka Først Vibeke Video 2 (1).mp4")
        f = self.kopi(nfd, [nfd])
        self.assertEqual((f.tolkning, f.tittel), ("ok", "Vibeke Video 2"))
        self.assertTrue(unicodedata.is_normalized("NFC", f.filnavn))
        # Original i NFD og kopi i NFC: originalen gjenkjennes
        orig_nfd = unicodedata.normalize("NFD", "Veksthuset Folka Først Vibeke Video 2.mp4")
        self.assertEqual(self.kopi("Veksthuset Folka Først Vibeke Video 2 (1).mp4", [orig_nfd]).tolkning, "ikke tolket")

    def test_andre_kopimerker_og_andre_konsepter_er_uendret(self):
        for navn in ("Veksthuset Folka Først Vibeke Video 2 kopi.mp4", "Veksthuset Folka Først Vibeke Video 2 v2.mp4"):
            self.assertEqual(self.kopi(navn, [navn]).tolkning, "ikke tolket", navn)
        self.assertEqual(self.kopi("Impulskjøp (1).mp4", ["Impulskjøp (1).mp4"], konsept="På Gata").tolkning, "ikke tolket")
        self.assertEqual(self.kopi("45. Kaffe (1).mp4", ["45. Kaffe (1).mp4"], konsept="Sitcom").tolkning, "ikke tolket")

    def test_ukjent_gjest_i_kopi_stopper_som_for_vanlig_fil(self):
        navn = "Veksthuset Folka Først Ola Video 2 (1).mp4"
        f = self.kopi(navn, [navn])
        self.assertEqual((f.tolkning, f.melding), ("stopp", "Ukjent gjest: Ola"))

    def test_skann_gir_merknad(self):
        import fetch_drive
        tre = {"root": [mappe("ff", "Folka Først")], "ff": [mappe("ff45", "Uke 45")],
               "ff45": [video("k1234567890", "Veksthuset Folka Først Vibeke Video 2 (1).mp4"),
                        video("k2234567890", "Veksthuset Folka Først Christian Video 3 (1).mp4"),
                        video("k3234567890", "Veksthuset Folka Først Christian Video 3.mp4")]}
        filer, merknader, _ = fetch_drive.skann(FakeDrive(tre), "root", date(2026, 10, 26), 12, GJESTER, MALER)
        rader = {fetch_drive.rad(*x)["drive_file_id"]: fetch_drive.rad(*x) for x in filer}
        self.assertEqual((rader["k1234567890"]["tolkning"], rader["k1234567890"]["tittel"], rader["k1234567890"]["filnavn"]),
                         ("ok", "Vibeke Video 2", "Veksthuset Folka Først Vibeke Video 2 (1).mp4"))
        self.assertEqual(rader["k2234567890"]["tolkning"], "ikke tolket")
        self.assertIn("Folka Først Uke 45: «Vibeke Video 2 (1).mp4» tolket som «Vibeke Video 2» (ingen original i mappen)", merknader)
        self.assertEqual(sum("tolket som" in m for m in merknader), 1)


VARIANTER = dt.les_varianter(Path("config/caption_varianter.csv").read_text(encoding="utf-8"))
GJESTER_JA_NEI = dt.les_gjester(
    "navn;yrke;arbeidssted;bruk_arbeidssted\n"
    "Christian;regnskapsfører;Eika Økonomi Øst;ja\n"
    "Line;rådgiver;Navigatio;nei\n"
)


def gjestelinje(fil_id, navn="Christian", varianter=VARIANTER, filnavn=None):
    f = dt.tolk_fil("Folka Først", 2026, 45, filnavn or f"Veksthuset Folka Først {navn} Video 3.mp4",
                    gjester=GJESTER_JA_NEI, notater={}, maler=MALER, varianter=varianter, fil_id=fil_id)
    return f, f.caption_skjelett.split("\n\n")[1]


class Varianter(unittest.TestCase):
    def test_filen_har_fire_med_og_fire_uten_arbeidssted(self):
        self.assertEqual({k: len(v) for k, v in VARIANTER.items()}, {("Folka Først", True): 4, ("Folka Først", False): 4})

    def test_samme_fil_gir_samme_variant(self):
        # crc32 er stabil mellom kjøringer og Python-prosesser (ikke hash(), som er tilfeldig per prosess)
        self.assertEqual(gjestelinje("1AbCdEfGhIjK")[1], gjestelinje("1AbCdEfGhIjK")[1])
        self.assertEqual(dt.velg_variant(["a", "b", "c", "d"], "1AbCdEfGhIjK"), ["a", "b", "c", "d"][__import__("zlib").crc32(b"1AbCdEfGhIjK") % 4])

    def test_ulike_filer_gir_flere_varianter(self):
        linjer = {gjestelinje(f"fil-{i:03d}-abcdef")[1] for i in range(40)}
        self.assertEqual(len(linjer), 4)

    def test_med_og_uten_arbeidssted(self):
        alle_med = {gjestelinje(f"fil-{i:03d}-abcdef")[1] for i in range(40)}
        self.assertIn("Christian jobber som regnskapsfører i Eika Økonomi Øst og snakker om [SKRIV TEMA]!", alle_med)
        self.assertIn("Møt Christian, regnskapsfører i Eika Økonomi Øst. I dag snakker vi om [SKRIV TEMA]!", alle_med)
        self.assertTrue(all("Eika Økonomi Øst" in x for x in alle_med))
        alle_uten = {gjestelinje(f"fil-{i:03d}-abcdef", navn="Line")[1] for i in range(40)}
        self.assertEqual(len(alle_uten), 4)
        self.assertIn("Line er rådgiver og forteller om [SKRIV TEMA].", alle_uten)
        self.assertFalse(any("Navigatio" in x or " i " in x.split(",")[0] for x in alle_uten))

    def test_skriv_finnes_alltid_og_resten_er_uendret(self):
        for i in range(40):
            f, linje = gjestelinje(f"fil-{i:03d}-abcdef")
            deler = f.caption_skjelett.split("\n\n")
            self.assertEqual(deler[0], "[SKRIV BUDSKAP]")
            self.assertIn("[SKRIV TEMA]", linje)
            self.assertEqual(deler[2], "#podkast #norskepodkaster #arbeidslivet #oppstartsbedrift #grunder")

    def test_uten_fil_id_brukes_filnavnet(self):
        f1, a = gjestelinje(None)
        _, b = gjestelinje(None)
        self.assertEqual(a, b)
        navn = "Veksthuset Folka Først Christian Video 3.mp4"
        self.assertEqual(a, dt.velg_variant(VARIANTER[("Folka Først", True)], navn).format(
            navn="Christian", yrke="regnskapsfører", arbeidssted="Eika Økonomi Øst"))

    def test_mangler_eller_tom_fil_gir_standardmalen(self):
        for varianter in (None, {}, dt.les_varianter("konsept;med_arbeidssted;mal\n")):
            self.assertEqual(gjestelinje("1AbCdEfGhIjK", varianter=varianter)[1],
                             "Christian jobber som regnskapsfører i Eika Økonomi Øst og snakker om [SKRIV TEMA]!")

    def test_paa_gata_og_sitcom_er_uendret(self):
        pg = dt.tolk_fil("På Gata", 2026, 46, "Impulskjøp.mp4", gjester={}, notater={}, maler=MALER, varianter=VARIANTER, fil_id="x1234567890")
        sc = dt.tolk_fil("Sitcom", 2026, 45, "45. Kaffe.mp4", gjester={}, notater={}, maler=MALER, varianter=VARIANTER, fil_id="x1234567890")
        self.assertEqual(pg.caption_skjelett, "[SKRIV BUDSKAP]\n\nVi spør folk på gata: Impulskjøp\n\n#PåGata #Økonomi #ViralNorge")
        self.assertEqual(sc.caption_skjelett, "[SKRIV BUDSKAP]\n\n[SKRIV SPØRSMÅL TIL FØLGERNE]\n\n#sitcom #humor #norskhumor")

    def test_ugyldige_varianter(self):
        hode = "konsept;med_arbeidssted;mal\n"
        for linje in ("Folka Først;ja;{navn} i {arbeidssted} om tema\n",          # mangler [SKRIV TEMA]
                      "Folka Først;nei;{navn} i {arbeidssted} om [SKRIV TEMA]\n",  # arbeidssted uten «ja»
                      "Folka Først;ja;{navn} om [SKRIV TEMA]\n",                   # «ja» uten arbeidssted
                      "Folka Først;ja;{navn} {firma} i {arbeidssted} [SKRIV TEMA]\n",
                      "Folka Først;kanskje;{navn} [SKRIV TEMA]\n",
                      "Diverse;nei;{navn} [SKRIV TEMA]\n"):
            with self.assertRaises(ValueError, msg=linje):
                dt.les_varianter(hode + linje)

    def test_skann_bruker_fil_id_fra_drive(self):
        import fetch_drive
        tre = {"root": [mappe("ff", "Folka Først")], "ff": [mappe("ff45", "Uke 45")],
               "ff45": [video("IdEn123456", "Veksthuset Folka Først Christian Video 11.mp4")]}
        filer, _, _ = fetch_drive.skann(FakeDrive(tre), "root", date(2026, 10, 26), 12, GJESTER_JA_NEI, MALER, varianter=VARIANTER)
        forventet = dt.velg_variant(VARIANTER[("Folka Først", True)], "IdEn123456").format(
            navn="Christian", yrke="regnskapsfører", arbeidssted="Eika Økonomi Øst")
        self.assertEqual(filer[0][0].caption_skjelett.split("\n\n")[1], forventet)


class FakeDrive:
    """Mappetre som fetch_drive.skann leser, uten nettverk. tre: id → [elementer]."""

    def __init__(self, tre, filer=None):
        self.tre = tre
        self.filer = filer or {}  # fil-ID → metadata, None (404) eller et unntak (for files.get)
        self.sjekket = []

    def children(self, folder_id, what):
        return self.tre.get(folder_id, [])

    def finnes(self, file_id):
        self.sjekket.append(file_id)
        svar = self.filer.get(file_id)
        if isinstance(svar, Exception):
            raise svar
        return svar


def mappe(id_, navn, kan_liste=True):
    return {"id": id_, "name": navn, "mimeType": "application/vnd.google-apps.folder",
            "capabilities": {"canListChildren": kan_liste}}


def video(id_, navn):
    return {"id": id_, "name": navn, "mimeType": "video/mp4", "webViewLink": f"https://drive.example/{id_}"}


class Skann(unittest.TestCase):
    def test_hele_treet(self):
        import fetch_drive

        tre = {
            "root": [mappe("ff", "Folka Først"), mappe("pg", unicodedata.normalize("NFD", "På Gata")),
                     mappe("sc", "Sit-com"), mappe("uk", "Uten Kompetanse"), mappe("vm", "VM-innhold"),
                     mappe("ts", "Teasere"), mappe("x", "Diverse")],
            "ff": [mappe("ff45", "Uke 45"), mappe("ff40", "Uke 40"), mappe("ff46", "Uke 46", kan_liste=False),
                   video("løs", "Løs fil.mp4")],
            "ff45": [video("a", "Veksthuset Folka Først Christian Video 11.mp4"),
                     video("b", "Veksthuset Folka Først Ola Video 2.mp4"),
                     {"id": "c", "name": "notater.docx", "mimeType": "application/vnd.google-apps.document"}],
            "pg": [mappe("pg45", "uke 45"), mappe("pg46", "Uke 46"), video("pgløs", "Gammel løs.mp4")],
            "pg45": [video("d", "Veksthuset På Gata Dyreste kjøp.mp4")],
            "pg46": [video("f", "Impulskjøp.mp4")],
            "sc": [mappe("sc45", "Uke 45"), mappe("scd", "Drafts"), mappe("sc27", "27 - Uke 1")],
            "scd": [video("g", "Utkast.mp4")],
            "sc27": [video("h", "Veksthuset Sitcom Nyttår.mp4")],
            "uk": [mappe("uk45", "Uke 45")],
            "uk45": [video("e", "Skal ikke med.mp4")],
        }
        filer, merknader, ignorert = fetch_drive.skann(FakeDrive(tre), "root", date(2026, 10, 26), 12, GJESTER, MALER)
        rader = [fetch_drive.rad(*x) for x in filer]
        self.assertEqual([(r["drive_file_id"], r["tolkning"]) for r in rader],
                         [("a", "ok"), ("b", "stopp"), ("c", "ikke tolket"), ("d", "ok"), ("f", "ok"), ("h", "ok")])
        self.assertEqual(rader[0]["mappe"], "Folka Først/Uke 45")
        self.assertEqual(rader[3]["mappe"], "På Gata/uke 45")
        # På Gata i ukemappe: temaet fra filnavnet; løse filer ignoreres med melding
        self.assertEqual((rader[4]["mappe"], rader[4]["aar"], rader[4]["uke"], rader[4]["tema"]),
                         ("På Gata/Uke 46", 2026, 46, "Impulskjøp"))
        self.assertIn("Vi spør folk på gata: Impulskjøp", rader[4]["caption_skjelett"])
        self.assertIn("På Gata: fil utenfor ukemappe, ignorert: Gammel løs.mp4", merknader)
        # Eksplisitt år i mappenavnet
        self.assertEqual((rader[5]["aar"], rader[5]["uke"], rader[5]["tittel"]), (2027, 1, "Nyttår"))
        # Sitcom/Drafts: hoppet over uten merknad, bare én linje i oppsummeringen
        self.assertEqual(ignorert, ["Sitcom/Drafts"])
        self.assertFalse(any("Drafts" in m for m in merknader))
        self.assertNotIn("g", [r["drive_file_id"] for r in rader])
        self.assertEqual(rader[0]["drive_lenke"], "https://drive.example/a")
        self.assertTrue(all(r["finnes_i_drive"] for r in rader))
        self.assertIn("Ukjent mappe, ignorert: Diverse", merknader)
        self.assertIn("Folka Først: fil utenfor ukemappe, ignorert: Løs fil.mp4", merknader)
        self.assertIn("Folka Først Uke 46: ingen tilgang til innholdet i mappen", merknader)
        self.assertIn("Sitcom Uke 45: tom mappe", merknader)
        self.assertTrue(any(m.startswith("Folka Først: Uke 40 tolkes som 2027-W40") for m in merknader))
        self.assertFalse(any("Uten Kompetanse" in m or "Teasere" in m for m in merknader))


class FakeSupabase:
    """drive_videos i minnet, med PostgREST-upsert (merge-duplicates) og tabellens viktigste sjekker."""

    def __init__(self, kalender=()):
        self.rader = {}
        self.kall = []
        self.kalender = list(kalender)  # drive_file_id-er som ligger i planned_posts

    def select(self, table, params, schema=None):
        self.kall.append(("select", table))
        if table == "planned_posts":
            return [{"drive_file_id": i} for i in self.kalender]
        cols = params["select"].split(",")
        return [{c: r.get(c) for c in cols} for r in self.rader.values()]

    def update(self, table, filters, values):
        self.kall.append(("update", table))
        ider = filters["drive_file_id"].removeprefix("in.(").removesuffix(")").split(",")
        for i in ider:
            self.rader[i].update(values)

    def upsert(self, table, rows, on_conflict):
        self.kall.append(("upsert", table, on_conflict))
        assert len({frozenset(r) for r in rows}) == 1, "alle radene må ha de samme nøklene"
        for r in rows:
            assert all(v != "" for k, v in r.items() if k != "melding"), "tom streng i stedet for null"
            assert r["melding"] is not None, "melding er NOT NULL"
            if r["tolkning"] == "ok":
                assert r["tittel"] and r["caption_skjelett"], "drive_videos_ok_har_skjelett"
            gammel = self.rader.get(r["drive_file_id"])
            if gammel:
                gammel.update(r)  # bare kolonnene i radene oppdateres; forst_sett er ikke med
            else:
                self.rader[r["drive_file_id"]] = {"forst_sett": "første kjøring", **r}


class Innboks(unittest.TestCase):
    def tre(self, ff_navn="Veksthuset Folka Først Christian Video 11.mp4", kan_liste=True):
        return {
            "root": [mappe("ff", "Folka Først"), mappe("pg", "På Gata"), mappe("sc", "Sit-com")],
            "ff": [mappe("ff45", "Uke 45")],
            "ff45": [video("a", ff_navn), video("b", "Veksthuset Folka Først Ola Video 2.mp4")],
            "pg": [mappe("pg46", "Uke 46", kan_liste=kan_liste)],
            "pg46": [video("c", "Impulskjøp.mp4")],
            "sc": [mappe("sc45", "Uke 45")],
            "sc45": [video("d", "45. Det ordner seg, tror jeg.mp4"),
                     {"id": "e", "name": "Utkast.png", "mimeType": "image/png"}],
        }

    def kjor(self, klient, tre, naa):
        import fetch_drive
        ufullstendig = []
        filer, _, _ = fetch_drive.skann(FakeDrive(tre), "root", date(2026, 10, 26), 12, GJESTER, MALER,
                                        ufullstendig=ufullstendig)
        return fetch_drive.skriv_innboks([fetch_drive.rad(*x) for x in filer], ufullstendig, klient=klient, naa=naa)

    def test_nye_kjente_og_forst_sett(self):
        klient = FakeSupabase()
        t = self.kjor(klient, self.tre(), "2026-10-27T07:00:00+00:00")
        self.assertEqual(t, {"ny": 5, "oppdatert": 0, "uendret": 0, "stopp": 1, "ikke tolket": 1})
        t = self.kjor(klient, self.tre(), "2026-10-28T07:00:00+00:00")
        self.assertEqual((t["ny"], t["oppdatert"], t["uendret"]), (0, 0, 5))
        self.assertEqual(klient.rader["a"]["forst_sett"], "første kjøring")
        self.assertEqual(klient.rader["a"]["sist_sett"], "2026-10-28T07:00:00+00:00")
        t = self.kjor(klient, self.tre(ff_navn="Veksthuset Folka Først Christian Video 12.mp4"), "2026-10-29T07:00:00+00:00")
        self.assertEqual((t["ny"], t["oppdatert"], t["uendret"]), (0, 1, 4))
        self.assertEqual((klient.rader["a"]["tittel"], klient.rader["a"]["forst_sett"]), ("Christian Video 12", "første kjøring"))

    def test_tittel_for_alle_tre_konsepter_og_null_i_stedet_for_tom_streng(self):
        klient = FakeSupabase()
        self.kjor(klient, self.tre(), "2026-10-27T07:00:00+00:00")
        r = klient.rader
        self.assertEqual((r["a"]["tittel"], r["c"]["tittel"], r["d"]["tittel"]),
                         ("Christian Video 11", "Impulskjøp", "Det ordner seg, tror jeg"))
        self.assertEqual((r["c"]["tema"], r["c"]["gjest"], r["c"]["yrke"], r["c"]["videonr"]), ("Impulskjøp", None, None, None))
        self.assertEqual((r["d"]["gjest"], r["d"]["tema"], r["d"]["videonr"], r["d"]["melding"]), (None, None, None, ""))
        self.assertIsNone(r["e"]["drive_lenke"])  # mangler i Drive-svaret → null
        self.assertTrue(all(v != "" for rad in r.values() for k, v in rad.items() if k != "melding"))
        self.assertTrue(all(rad["finnes_i_drive"] is True for rad in r.values()))

    def test_stopp_og_ikke_tolket_skrives_med_melding(self):
        klient = FakeSupabase()
        self.kjor(klient, self.tre(), "2026-10-27T07:00:00+00:00")
        b, e = klient.rader["b"], klient.rader["e"]
        self.assertEqual((b["tolkning"], b["melding"], b["caption_skjelett"], b["tittel"]),
                         ("stopp", "Ukjent gjest: Ola", None, "Ola Video 2"))
        self.assertEqual((e["tolkning"], e["tittel"], e["caption_skjelett"]), ("ikke tolket", None, None))
        self.assertTrue(e["melding"].startswith("Ikke en videofil"))

    def test_ufullstendig_skanning_skriver_ingenting(self):
        klient = FakeSupabase()
        with self.assertRaises(SystemExit) as cm:
            self.kjor(klient, self.tre(kan_liste=False), "2026-10-27T07:00:00+00:00")
        self.assertIn("ufullstendig (ingen tilgang: På Gata/Uke 46)", str(cm.exception.code))
        self.assertEqual((klient.kall, klient.rader), ([], {}))

    def test_bare_drive_videos_roeres(self):
        klient = FakeSupabase()
        self.kjor(klient, self.tre(), "2026-10-27T07:00:00+00:00")
        self.assertEqual({k[1] for k in klient.kall}, {"drive_videos"})
        self.assertIn(("upsert", "drive_videos", "drive_file_id"), klient.kall)

    def test_lengdegrenser(self):
        import fetch_drive
        grunn = {"drive_file_id": "x", "konsept": "Sitcom", "aar": 2026, "uke": 45, "mappe": "Sitcom/Uke 45",
                 "filnavn": "a.mp4", "drive_lenke": None, "tittel": "T", "gjest": None, "yrke": None, "videonr": None,
                 "tema": None, "tolkning": "ok", "melding": "", "caption_skjelett": "S", "finnes_i_drive": True,
                 "endret_i_drive": None}
        r = fetch_drive.til_db({**grunn, "tittel": "x" * 201}, "naa")
        self.assertEqual((r["tolkning"], r["tittel"], r["melding"]), ("ikke tolket", None, "Tittelen er lengre enn 200 tegn"))
        r = fetch_drive.til_db({**grunn, "caption_skjelett": "", "filnavn": "f" * 400 + ".mp4", "melding": "m" * 1500}, "naa")
        self.assertEqual(r["tolkning"], "ikke tolket")
        self.assertEqual((len(r["filnavn"]), len(r["melding"])), (300, 1000))
        self.assertIsNone(r["caption_skjelett"])
        self.assertNotIn("forst_sett", fetch_drive.til_db({**grunn, "forst_sett": "x"}, "naa"))

    def test_kort_feil_viser_ikke_raden(self):
        import fetch_drive
        e = RuntimeError('Supabase svarte 400: {"code":"23514","details":"Failing row contains (a, Christian, …)",'
                         '"hint":null,"message":"new row for relation \\"drive_videos\\" violates check constraint"}')
        kort = fetch_drive.kort_feil(e)
        self.assertTrue(kort.startswith("Supabase svarte 400 (23514): new row for relation"))
        self.assertNotIn("Failing row", kort)
        self.assertEqual(fetch_drive.kort_feil(RuntimeError('Supabase svarte 500: {"details":"x"')), "Supabase svarte 500")

    def test_flagg(self):
        import contextlib
        import io as _io
        import fetch_drive
        for argv in ([], ["--dry-run", "--skriv"]):
            with contextlib.redirect_stdout(_io.StringIO()), contextlib.redirect_stderr(_io.StringIO()):
                with self.assertRaises(SystemExit) as cm:
                    fetch_drive.main(argv)
            self.assertEqual(cm.exception.code, 2, argv)


class Borte(unittest.TestCase):
    """Innboksrader for filer som er borte fra Drive. i_dag 26.10.2026 (uke 44), horisont 12: vindu uke 44 – 2027-W03."""

    I_DAG = date(2026, 10, 26)

    @staticmethod
    def db_rad(id_, aar, uke, finnes=True, gjest="Vibeke", nr=2):
        return {"drive_file_id": id_, "konsept": "Folka Først", "aar": aar, "uke": uke, "mappe": f"Folka Først/Uke {uke}",
                "filnavn": f"Veksthuset Folka Først {gjest} Video {nr}.mp4", "tittel": f"{gjest} Video {nr}", "gjest": gjest,
                "videonr": nr, "tolkning": "ok", "melding": "", "caption_skjelett": "S", "finnes_i_drive": finnes,
                "forst_sett": "før"}

    def oppsett(self, filer=None, kalender=("kalender01",), kan_liste=True):
        klient = FakeSupabase(kalender=kalender)
        for r in (
            self.db_rad("sett000001", 2026, 45, gjest="Christian", nr=11),  # finnes i skanningen
            self.db_rad("gammel0001", 2026, 45),                            # borte (404)
            self.db_rad("papirkurv1", 2026, 46, nr=3),                      # borte (papirkurv)
            self.db_rad("flyttet001", 2026, 47, nr=4),                      # finnes et annet sted
            self.db_rad("kalender01", 2026, 48, nr=5),                      # borte og i kalenderen
            self.db_rad("fremtid001", 2027, 6, nr=6),                       # bak horisonten: ikke skannet
            self.db_rad("passert001", 2026, 43, nr=7),                      # passert: ikke skannet
            self.db_rad("tidlig0001", 2026, 50, finnes=False, nr=8),        # merket borte fra før
        ):
            klient.rader[r["drive_file_id"]] = r
        tre = {"root": [mappe("ff", "Folka Først")], "ff": [mappe("ff45", "Uke 45", kan_liste=kan_liste)],
               "ff45": [video("sett000001", "Veksthuset Folka Først Christian Video 11.mp4")]}
        drive = FakeDrive(tre, filer if filer is not None else {
            "gammel0001": None,
            "papirkurv1": {"id": "papirkurv1", "trashed": True, "mappe": "Uke 46"},
            "flyttet001": {"id": "flyttet001", "trashed": False, "mappe": "27 - Uke 9"},
            "kalender01": None,
        })
        return klient, drive

    def kjor(self, klient, drive, skriv):
        import contextlib
        import io as _io
        import fetch_drive
        ufullstendig = []
        filer, _, _ = fetch_drive.skann(drive, "root", self.I_DAG, 12, GJESTER, MALER, ufullstendig=ufullstendig)
        ut = _io.StringIO()
        with contextlib.redirect_stdout(ut):
            s = fetch_drive.oppdater_innboks(drive, [fetch_drive.rad(*x) for x in filer], ufullstendig, self.I_DAG, 12,
                                             skriv, klient=klient, naa="2026-10-28T07:00:00+00:00")
        return s, ut.getvalue()

    def test_skannevinduet(self):
        self.assertEqual(dt.skannevindu(self.I_DAG, 12), ((2026, 44), (2027, 3)))
        self.assertEqual(dt.skannevindu(date(2026, 12, 30), 2), ((2026, 53), (2027, 2)))  # over årsskiftet
        self.assertTrue(dt.i_vindu(2026, 53, ((2026, 52), (2027, 1))))
        self.assertFalse(dt.i_vindu(2027, 53, ((2026, 44), (2027, 3))))  # uke som ikke finnes

    def test_dry_run_viser_men_skriver_ingenting(self):
        klient, drive = self.oppsett()
        s, ut = self.kjor(klient, drive, skriv=False)
        self.assertEqual(sorted(r["drive_file_id"] for r, _ in s["borte"]), ["gammel0001", "kalender01", "papirkurv1"])
        self.assertEqual([(r["drive_file_id"], m) for r, m in s["annet_sted"]], [("flyttet001", "27 - Uke 9")])
        self.assertEqual((s["ikke_skannet"], s["allerede_borte"]), (2, 1))
        self.assertEqual({k[0] for k in klient.kall}, {"select"})
        self.assertTrue(all(r["finnes_i_drive"] for i, r in klient.rader.items() if i != "tidlig0001"))
        self.assertIn("Ville merket 3 som borte fra Drive", ut)
        self.assertIn("2026-W45 Folka Først: Vibeke #2: borte (slettet eller utilgjengelig (404))", ut)
        self.assertIn("2026-W46 Folka Først: Vibeke #3: borte (i papirkurven)", ut)
        self.assertIn("2026-W48 Folka Først: Vibeke #5: borte (slettet eller utilgjengelig (404)) (ligger i kalenderen)", ut)
        self.assertIn("Ikke skannet (uke utenfor uke 44 2026 – uke 3 2027, røres ikke): 2", ut)
        self.assertIn("2026-W47 Folka Først: Vibeke #4: ligger i «27 - Uke 9»", ut)

    def test_utenfor_horisonten_og_passert_sjekkes_ikke_og_roeres_ikke(self):
        klient, drive = self.oppsett()
        self.kjor(klient, drive, skriv=True)
        self.assertNotIn("fremtid001", drive.sjekket)
        self.assertNotIn("passert001", drive.sjekket)
        self.assertTrue(klient.rader["fremtid001"]["finnes_i_drive"] and klient.rader["passert001"]["finnes_i_drive"])

    def test_skriv_merker_borte_og_roerer_aldri_kalenderen(self):
        klient, drive = self.oppsett()
        s, ut = self.kjor(klient, drive, skriv=True)
        self.assertEqual(s["merket"], 3)
        self.assertEqual({i for i, r in klient.rader.items() if r["finnes_i_drive"] is False},
                         {"gammel0001", "papirkurv1", "kalender01", "tidlig0001"})
        self.assertTrue(klient.rader["flyttet001"]["finnes_i_drive"])
        self.assertEqual(klient.rader["gammel0001"]["forst_sett"], "før")  # aldri slettet
        self.assertEqual(len(klient.rader), 8)
        # planned_posts bare lest; skriving bare til drive_videos, og upsert før update
        self.assertEqual([k for k in klient.kall if k[1] == "planned_posts"], [("select", "planned_posts")])
        skriv = [k for k in klient.kall if k[0] != "select"]
        self.assertEqual(skriv, [("upsert", "drive_videos", "drive_file_id"), ("update", "drive_videos")])
        self.assertIn("Merket 3 som borte fra Drive", ut)

    def test_fil_tilbake_blir_true(self):
        klient, drive = self.oppsett()
        klient.rader["sett000001"]["finnes_i_drive"] = False  # var merket borte, ses nå igjen
        self.kjor(klient, drive, skriv=True)
        self.assertIs(klient.rader["sett000001"]["finnes_i_drive"], True)

    def test_ufullstendig_skanning_skriver_ingenting(self):
        klient, drive = self.oppsett(kan_liste=False)
        with self.assertRaises(SystemExit) as cm:
            self.kjor(klient, drive, skriv=True)
        self.assertIn("ufullstendig", str(cm.exception.code))
        self.assertEqual((klient.kall, drive.sjekket), ([], []))
        s, ut = self.kjor(klient, drive, skriv=False)  # dry-run: melding, ingen sjekk
        self.assertIsNone(s)
        self.assertIn("sjekken av borte filer er hoppet over", ut)

    def test_annen_feil_fra_files_get_stopper_uten_skriving(self):
        import fetch_drive
        filer = {"gammel0001": None, "papirkurv1": fetch_drive.DriveApiError("Internal error (HTTP 500)", 500),
                 "flyttet001": None, "kalender01": None}
        klient, drive = self.oppsett(filer=filer)
        with self.assertRaises(SystemExit) as cm:
            self.kjor(klient, drive, skriv=True)
        self.assertIn("files.get feilet", str(cm.exception.code))
        self.assertEqual({k[0] for k in klient.kall}, {"select"})
        self.assertTrue(klient.rader["gammel0001"]["finnes_i_drive"])

    def test_ingen_borte_gir_ingen_update(self):
        klient, drive = self.oppsett(filer={i: {"id": i, "trashed": False, "mappe": "Annet"}
                                            for i in ("gammel0001", "papirkurv1", "flyttet001", "kalender01")})
        s, ut = self.kjor(klient, drive, skriv=True)
        self.assertEqual(s["merket"], 0)
        self.assertNotIn(("update", "drive_videos"), klient.kall)
        self.assertIn("Merket 0 som borte fra Drive (finnes_i_drive = false).", ut)


if __name__ == "__main__":
    unittest.main()
