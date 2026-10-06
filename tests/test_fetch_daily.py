"""
Tester for Instagram-døgnet i fetch_daily.py: at kallet bare dekker ett Stillehavsdøgn, og at alle
formater lagres (0 når de mangler). Ingen nettverkskall: api_get erstattes. Kjør:  python -m unittest -v
"""
import os
import unittest
from datetime import date, datetime
from unittest import mock
from zoneinfo import ZoneInfo

os.environ.setdefault("META_ACCESS_TOKEN", "test-token")
os.environ.setdefault("IG_USER_ID", "123")

import fetch_daily  # noqa: E402

PT = ZoneInfo("America/Los_Angeles")


def meta_response(total, parts):
    """Svar som Metas /insights med metric_type=total_value og breakdown=media_product_type."""
    return {"data": [{
        "name": metric,
        "total_value": {
            "value": total.get(metric, 0),
            "breakdowns": [{"dimension_keys": ["media_product_type"], "results": [
                {"dimension_values": [kind], "value": values.get(metric, 0)} for kind, values in parts.items()
            ]}],
        },
    } for metric in fetch_daily.IG_METRICS]}


class IgDayTest(unittest.TestCase):
    def test_kallet_dekker_bare_ett_stillehavsdogn(self):
        day = date(2026, 9, 28)
        with mock.patch("fetch_daily.ig.api_get", return_value=meta_response({}, {})) as api_get:
            fetch_daily.ig_day(1, day)
        params = api_get.call_args.args[1]
        since = datetime.fromtimestamp(params["since"], PT)
        until = datetime.fromtimestamp(params["until"], PT)
        self.assertEqual((since.date(), since.hour, since.minute), (day, 0, 0))
        self.assertEqual((until.date(), until.hour, until.minute, until.second), (day, 23, 59, 59))
        self.assertEqual(params["until"] - params["since"], 86399)  # aldri neste midnatt
        self.assertEqual((params["metric_type"], params["period"], params["breakdown"]),
                         ("total_value", "day", "media_product_type"))

    def test_alle_formater_lagres_og_mangler_blir_0(self):
        parts = {"REEL": {"views": 4532, "likes": 10}, "POST": {"views": 5}}
        with mock.patch("fetch_daily.ig.api_get", return_value=meta_response({"views": 4537, "likes": 10}, parts)):
            rows = fetch_daily.ig_day(1, date(2026, 9, 28))
        by_format = {r["format"]: r for r in rows}
        self.assertEqual(sorted(by_format), sorted(fetch_daily.IG_ALL_FORMATS))
        self.assertEqual(by_format["ALL"]["views"], 4537)
        self.assertEqual(by_format["REELS"]["views"], 4532)
        self.assertEqual(by_format["FEED"]["views"], 5)
        for fmt in ("STORY", "AD", "OTHER"):
            self.assertEqual((by_format[fmt]["views"], by_format[fmt]["likes"], by_format[fmt]["saves"]), (0, 0, 0))
        self.assertTrue(all(r["activity_date"] == "2026-09-28" for r in rows))

    def test_karuseller_er_feed_og_ukjente_typer_er_other(self):
        parts = {"POST": {"views": 45}, "CAROUSEL_CONTAINER": {"views": 34}, "DEFAULT_DO_NOT_USE": {"views": 2}}
        with mock.patch("fetch_daily.ig.api_get", return_value=meta_response({"views": 81}, parts)):
            rows = {r["format"]: r for r in fetch_daily.ig_day(1, date(2026, 9, 28))}
        self.assertEqual((rows["FEED"]["views"], rows["OTHER"]["views"], rows["ALL"]["views"]), (79, 2, 81))
        # Delene summerer til totalen; ALL legges aldri oppå formatene.
        self.assertEqual(sum(r["views"] for f, r in rows.items() if f != "ALL"), rows["ALL"]["views"])


if __name__ == "__main__":
    unittest.main()
