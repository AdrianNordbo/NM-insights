"""Tester for TikTok-hentingen: bearbeiding, null for Business-felt, feilklassifisering. Uten nettverk."""
import unittest
from datetime import datetime, timezone
from unittest import mock

import fetch_daily
import fetch_tiktok
import tiktok_api
from concepts import CTF, PA_GATA, apply_concepts

VIDEO = {
    "item_id": "7300000000000000001", "create_time": "1791916800",  # 13.10.2026 18:40 UTC
    "caption": "Ubehagelige spørsmål #PåGata #veksthuset", "media_type": "VIDEO", "is_ad": False,
    "share_url": "https://www.tiktok.com/@veksthuset/video/7300000000000000001?utm_campaign=tt4d_open_api&utm_source=1",
    "video_duration": 31.5, "video_views": 1200, "likes": 80, "comments": 4, "shares": 6, "favorites": 3,
    "reach": 900, "total_time_watched": 4000.5, "average_time_watched": 3.3, "full_video_watched_rate": 0.12,
    "new_followers": 2,
}


class Bearbeiding(unittest.TestCase):
    def test_innlegg_og_lenke_uten_utm(self):
        post = fetch_tiktok.to_post(VIDEO)
        self.assertEqual(post["id"], "7300000000000000001")
        self.assertEqual(post["published"], datetime(2026, 10, 13, 18, 40, tzinfo=timezone.utc))
        self.assertEqual(post["timestamp_oslo"], "2026-10-13 20:40")
        self.assertEqual(post["hashtags"], "PåGata veksthuset")
        self.assertEqual(post["media_product_type"], "REELS")
        apply_concepts([post], overrides={}, platform="tiktok")
        row = fetch_tiktok.video_row(3, post, "2026-10-13T20:00:00+02:00")
        self.assertEqual(row["permalink"], "https://www.tiktok.com/@veksthuset/video/7300000000000000001")
        self.assertEqual(row["hashtags"], ["pågata", "veksthuset"])
        self.assertEqual(row["media_type"], "VIDEO")

    def test_business_felt_blir_null_ikke_0(self):
        post = fetch_tiktok.to_post(VIDEO)
        row = fetch_tiktok.insight_row(1, post, datetime(2026, 10, 13).date(), "kveld", "x")
        self.assertIsNone(row["profile_views"])
        self.assertEqual(row["views"], 1200)
        self.assertEqual(row["total_time_watched_s"], 4000.5)
        dyp = fetch_tiktok.insight_row(1, fetch_tiktok.to_post({**VIDEO, "reach": None}), datetime(2026, 10, 13).date(), "kveld", "x")
        self.assertIsNone(dyp["reach"])

    def test_reach_0_med_visninger_er_ikke_klart(self):
        day = datetime(2026, 10, 13).date()
        row = fetch_tiktok.insight_row(1, fetch_tiktok.to_post({**VIDEO, "reach": 0, "video_views": 350}), day, "kveld", "x")
        self.assertIsNone(row["reach"])
        row = fetch_tiktok.insight_row(1, fetch_tiktok.to_post({**VIDEO, "reach": 0, "video_views": 0}), day, "kveld", "x")
        self.assertEqual(row["reach"], 0)

    def test_kontotype_styrer_feltene(self):
        self.assertEqual(tiktok_api.business_fields({"is_business_account": False, "has_advanced_access": False}), ([], []))
        extra_daily, extra_video = tiktok_api.business_fields({"is_business_account": False, "has_advanced_access": True})
        self.assertIn("daily_new_followers", extra_daily)
        self.assertEqual(extra_video, [])
        self.assertEqual(tiktok_api.business_fields({"is_business_account": True})[1], ["profile_views"])


class Konsepter(unittest.TestCase):
    def test_photo_bruker_feed_regler_og_video_reels_regler(self):
        photo = fetch_tiktok.to_post({**VIDEO, "item_id": "2", "media_type": "PHOTO", "caption": "Nytt fra økonomien #veksthuset"})
        video = fetch_tiktok.to_post({**VIDEO, "item_id": "3", "caption": "Nytt fra økonomien #veksthuset"})
        gata = fetch_tiktok.to_post(VIDEO)
        apply_concepts([photo, video, gata], overrides={}, platform="tiktok")
        self.assertEqual(photo["concept"], CTF)
        self.assertNotEqual(video["concept"], CTF)
        self.assertEqual(gata["concept"], PA_GATA)

    def test_rettelser_med_tiktok_prefiks(self):
        post = fetch_tiktok.to_post(VIDEO)
        apply_concepts([post], overrides={"tiktok:7300000000000000001": "Sitcom"}, platform="tiktok")
        self.assertEqual((post["concept"], post["concept_source"]), ("Sitcom", "manuell"))
        # Uten prefiks gjelder ikke rettelsen for TikTok (kan være en Instagram-ID)
        post = fetch_tiktok.to_post(VIDEO)
        apply_concepts([post], overrides={"7300000000000000001": "Sitcom"}, platform="tiktok")
        self.assertEqual(post["concept_source"], "auto")


class Daglig(unittest.TestCase):
    METRICS = [
        {"date": "2026-10-11", "video_views": 500, "likes": 20, "comments": 2, "shares": 3, "profile_views": 7,
         "followers_count": 410, "audience_activity": [{"hour": "1", "count": 2}]},
        {"date": "2026-10-10", "video_views": 400, "likes": 10, "comments": 1, "shares": 0, "profile_views": 5,
         "followers_count": 405},
        {"date": "2026-10-12", "video_views": None, "likes": None, "comments": None, "shares": None,
         "followers_count": None},
        # Slik TikTok faktisk svarer for et døgn som ikke er ferdig behandlet: nuller, også følgertotalen
        {"date": "2026-10-13", "video_views": 0, "likes": 0, "comments": 0, "shares": 0, "profile_views": 0,
         "followers_count": 0},
    ]

    def test_dognrader_bare_for_ferdige_dogn(self):
        rows = fetch_daily.tt_rows(3, self.METRICS)
        self.assertEqual([r["activity_date"] for r in rows], ["2026-10-10", "2026-10-11"])
        r = rows[1]
        self.assertEqual((r["format"], r["views"], r["likes"], r["comments"], r["shares"]), ("ALL", 500, 20, 2, 3))
        self.assertIsNone(r["saves"])
        self.assertEqual(r["interactions"], 25)
        self.assertEqual(r["raw"]["day_timezone"], "UTC")
        self.assertNotIn("audience_activity", r["raw"])

    def test_nye_folgere_null_uten_tilgang(self):
        rows = fetch_daily.tt_follower_rows(3, [{**m, "daily_new_followers": 4} for m in self.METRICS], advanced=False)
        self.assertEqual([(r["snapshot_date"], r["followers_count"], r["new_followers"]) for r in rows],
                         [("2026-10-11", 410, None), ("2026-10-10", 405, None)])
        rows = fetch_daily.tt_follower_rows(3, [{**m, "daily_new_followers": 4} for m in self.METRICS], advanced=True)
        self.assertEqual(rows[0]["new_followers"], 4)


class Feil(unittest.TestCase):
    def response(self, body, status=200):
        r = mock.Mock(status_code=status)
        r.json.return_value = body
        return r

    def test_ok_svar_gir_data(self):
        self.assertEqual(tiktok_api._parse(self.response({"code": 0, "data": {"a": 1}}), "x"), {"a": 1})

    def test_overbelastning_er_forbigaende_ugyldig_token_er_ikke(self):
        with self.assertRaises(tiktok_api.TikTokApiError) as e:
            tiktok_api._parse(self.response({"code": 40100, "message": "Too many requests"}), "x")
        self.assertTrue(e.exception.transient)
        with self.assertRaises(tiktok_api.TikTokApiError) as e:
            tiktok_api._parse(self.response({"code": 40105, "message": "access token invalid"}), "x")
        self.assertFalse(e.exception.transient)
        with self.assertRaises(tiktok_api.TikTokApiError) as e:
            tiktok_api._parse(self.response({"code": 51010, "message": "Internal Time out"}), "x")
        self.assertTrue(e.exception.transient)
        with self.assertRaises(tiktok_api.TikTokApiError) as e:
            tiktok_api._parse(self.response({}, status=503), "x")
        self.assertTrue(e.exception.transient)

    def test_assert_clean_stopper_tokens(self):
        tt = object.__new__(tiktok_api.TikTok)
        tt._access_token, tt._refresh_token, tt._client_secret = "act.hemmelig", "rft.hemmelig", "secret-x"
        tt.assert_clean({"ok": 1})
        for leaked in ("act.hemmelig", "rft.hemmelig", "secret-x"):
            with self.assertRaises(RuntimeError):
                tt.assert_clean({"raw": f"... {leaked} ..."})

    def test_feltrapport(self):
        report = tiktok_api.field_report([{"a": 1, "b": None}, {"a": 2}], ["a", "b", "c"])
        self.assertEqual(report, {"a": (2, 0, 0), "b": (0, 1, 1), "c": (0, 0, 2)})


if __name__ == "__main__":
    unittest.main()
