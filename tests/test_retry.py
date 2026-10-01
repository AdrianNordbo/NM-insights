"""
Tester for retry-logikken (retry.py) og hvordan fetch_youtube.py og fetch_instagram.py klassifiserer feil.
Ingen nettverkskall: requests.get og time.sleep erstattes. Kjør:  .venv/Scripts/python -m unittest -v
"""
import os
import unittest
from unittest import mock

import requests

# Skriptene leser miljøvariabler ved import; testene trenger ingen ekte verdier.
os.environ.setdefault("META_ACCESS_TOKEN", "test-token")
os.environ.setdefault("IG_USER_ID", "123")

import fetch_instagram as ig  # noqa: E402
import fetch_youtube as yt_mod  # noqa: E402
from retry import Failures, retry  # noqa: E402


class Transient(Exception):
    transient = True


class Permanent(Exception):
    transient = False


def flaky(errors, result="ok"):
    """Funksjon som kaster feilene i rekkefølge, og deretter returnerer result."""
    calls = []

    def fn():
        calls.append(1)
        if len(calls) <= len(errors):
            raise errors[len(calls) - 1]
        return result

    return fn, calls


def is_transient(e):
    return getattr(e, "transient", False)


class FakeResponse:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def youtube_client():
    """YouTube-klient uten ekte innlogging."""
    yt = object.__new__(yt_mod.YouTube)
    yt.creds = mock.Mock(valid=True, token="test-access-token")
    return yt


GOOGLE_500 = {"error": {"code": 500, "message": "Internal error encountered.",
                        "errors": [{"reason": "backendError", "message": "Internal error encountered."}]}}
GOOGLE_QUOTA = {"error": {"code": 403, "message": "The request cannot be completed because you have exceeded your quota.",
                          "errors": [{"reason": "quotaExceeded"}]}}
META_BAD_METRIC = {"error": {"message": "(#100) metric[3] must be one of the following values", "code": 100}}
META_TRANSIENT = {"error": {"message": "An unexpected error has occurred. Please retry your request later.",
                            "code": 2, "is_transient": True}}


class RetryTest(unittest.TestCase):
    def test_forbigaende_feil_prover_igjen_med_okende_ventetid(self):
        fn, calls = flaky([Transient("hikke"), Transient("hikke")])
        sleeps = []
        self.assertEqual(retry(fn, what="test", is_transient=is_transient, sleep=sleeps.append, log=lambda *a, **k: None), "ok")
        self.assertEqual(len(calls), 3)
        self.assertEqual(sleeps, [2, 5])

    def test_varig_feil_kastes_med_en_gang(self):
        fn, calls = flaky([Permanent("ugyldig metric")])
        sleeps = []
        with self.assertRaises(Permanent):
            retry(fn, what="test", is_transient=is_transient, sleep=sleeps.append, log=lambda *a, **k: None)
        self.assertEqual((len(calls), sleeps), (1, []))

    def test_gir_opp_etter_tre_nye_forsok(self):
        fn, calls = flaky([Transient("nede")] * 10)
        sleeps = []
        with self.assertRaises(Transient):
            retry(fn, what="test", is_transient=is_transient, sleep=sleeps.append, log=lambda *a, **k: None)
        self.assertEqual(len(calls), 4)
        self.assertEqual(sleeps, [2, 5, 10])


class FailuresTest(unittest.TestCase):
    def test_soft_logger_og_gaar_videre(self):
        logs = []
        f = Failures(Permanent, log=lambda *a, **k: logs.append(a[0]))
        self.assertEqual(f.soft("per-video for abc", lambda: (_ for _ in ()).throw(Permanent("feil")), default=[]), [])
        self.assertEqual(f.failed, [("per-video for abc", "feil")])
        self.assertIn("FEIL (hopper over): per-video for abc: feil", logs[0])

    def test_programfeil_slippes_ikke_forbi(self):
        f = Failures(Permanent, log=lambda *a, **k: None)
        with self.assertRaises(KeyError):
            f.soft("noe", lambda: {}["mangler"])

    def test_en_hikke_gir_ikke_rod_kjoring(self):
        f = Failures(Permanent, log=lambda *a, **k: None)
        for i in range(3):
            f.soft(f"kall {i}", lambda: (_ for _ in ()).throw(Permanent("feil")))
        self.assertEqual(f.problems(saved_anything=True), [])
        f.finish(saved_anything=True, name="Test")  # ingen SystemExit

    def test_for_mange_feil_eller_ingenting_lagret_gir_rod_kjoring(self):
        f = Failures(Permanent, log=lambda *a, **k: None)
        for i in range(4):
            f.soft(f"kall {i}", lambda: (_ for _ in ()).throw(Permanent("feil")))
        self.assertEqual(f.problems(saved_anything=True), ["4 kall feilet (grensen er 3)"])
        self.assertEqual(Failures(Permanent).problems(saved_anything=False), ["ingenting ble lagret"])
        with self.assertRaises(SystemExit):
            f.finish(saved_anything=True, name="Test")


class YouTubeTest(unittest.TestCase):
    def setUp(self):
        self.sleeps = []
        patcher = mock.patch("retry._sleep", side_effect=self.sleeps.append)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_internal_error_fra_analytics_proves_igjen(self):
        ok = FakeResponse(200, {"columnHeaders": [{"name": "day"}, {"name": "views"}], "rows": [["2026-09-28", 5]]})
        with mock.patch("fetch_youtube.requests.get", side_effect=[FakeResponse(500, GOOGLE_500), ok]) as get, \
             mock.patch("fetch_youtube.time.sleep"):
            rows = youtube_client().analytics(startDate="2026-09-01", endDate="2026-09-30", metrics="views", dimensions="day")
        self.assertEqual(rows, [{"day": "2026-09-28", "views": 5}])
        self.assertEqual(get.call_count, 2)
        self.assertEqual(self.sleeps, [2])

    def test_nettverksfeil_og_ugyldig_svar_proves_igjen(self):
        ok = FakeResponse(200, {"items": [1]})
        responses = [requests.ConnectionError("brudd"), FakeResponse(502, ValueError("html")), ok]
        with mock.patch("fetch_youtube.requests.get", side_effect=responses):
            self.assertEqual(youtube_client().data("videos", {"id": "x"}), {"items": [1]})
        self.assertEqual(self.sleeps, [2, 5])

    def test_brukt_opp_kvote_proves_ikke_igjen(self):
        with mock.patch("fetch_youtube.requests.get", return_value=FakeResponse(403, GOOGLE_QUOTA)):
            with self.assertRaises(yt_mod.YouTubeApiError) as ctx:
                youtube_client().data("videos", {"id": "x"})
        self.assertFalse(ctx.exception.transient)
        self.assertEqual(self.sleeps, [])

    def test_feilmeldingen_inneholder_ikke_tokenet(self):
        with mock.patch("fetch_youtube.requests.get", side_effect=requests.ConnectionError("https://x?token=hemmelig")):
            with self.assertRaises(yt_mod.YouTubeApiError) as ctx:
                youtube_client().data("videos", {})
        self.assertNotIn("hemmelig", str(ctx.exception))
        self.assertNotIn("test-access-token", str(ctx.exception))


class MetaTest(unittest.TestCase):
    def setUp(self):
        self.sleeps = []
        patcher = mock.patch("retry._sleep", side_effect=self.sleeps.append)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_is_transient_og_5xx_proves_igjen(self):
        responses = [FakeResponse(400, META_TRANSIENT), FakeResponse(500, ValueError("html")), FakeResponse(200, {"id": "1"})]
        with mock.patch("fetch_instagram.requests.get", side_effect=responses):
            self.assertEqual(ig.api_get("123", {"fields": "id"}), {"id": "1"})
        self.assertEqual(self.sleeps, [2, 5])

    def test_ugyldig_metric_kastes_med_en_gang_og_fallback_virker(self):
        # Første kall (alle metrics) feiler varig, deretter én og én: én ugyldig, resten ok.
        ok = FakeResponse(200, {"data": [{"name": "reach", "values": [{"value": 10}]}]})
        responses = [FakeResponse(400, META_BAD_METRIC)] + [ok, FakeResponse(400, META_BAD_METRIC)] + [ok] * 3
        with mock.patch("fetch_instagram.requests.get", side_effect=responses):
            result, _ = ig.fetch_insights({"id": "m1", "media_product_type": "FEED"})
        self.assertEqual(self.sleeps, [])
        self.assertIsNone(result["views"])
        self.assertEqual(result["reach"], 10)

    def test_forbigaende_feil_som_ikke_gaar_over_hopper_over_innlegget(self):
        with mock.patch("fetch_instagram.requests.get", return_value=FakeResponse(500, META_TRANSIENT)):
            f = Failures(ig.MetaApiError, log=lambda *a, **k: None)
            result = f.soft("innsikt for innlegg m1", lambda: ig.fetch_insights({"id": "m1", "media_product_type": "REELS"}))
        self.assertIsNone(result)
        self.assertEqual(self.sleeps, [2, 5, 10])  # bare hovedkallet, ikke én og én metric
        self.assertEqual(len(f.failed), 1)


if __name__ == "__main__":
    unittest.main()
