"""
NM Insights - datainnhenter for Instagram (Meta Graph API).

Henter alle innlegg + innsiktstall for én Instagram-konto og lagrer dem i
data/posts.csv (kan åpnes i Excel) og data/posts.json.

Kjør:  python fetch_instagram.py
"""
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv

from concepts import apply_concepts

load_dotenv()

TOKEN = os.getenv("META_ACCESS_TOKEN")
IG_USER_ID = os.getenv("IG_USER_ID")
API_VERSION = os.getenv("GRAPH_API_VERSION", "v26.0")
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
OSLO = ZoneInfo("Europe/Oslo")
DATA_DIR = Path("data")

MEDIA_FIELDS = (
    "id,caption,media_type,media_product_type,timestamp,"
    "like_count,comments_count,permalink"
)

# Metrics vi prøver å hente. Meta endrer disse av og til, så skriptet
# tåler at enkelte metrics ikke støttes for en gitt innleggstype.
BASE_METRICS = ["reach", "views", "saved", "shares", "total_interactions"]
REELS_EXTRA = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]

WEEKDAYS_NO = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)

COLUMN_ORDER = [
    "id", "timestamp_oslo", "weekday", "hour", "concept", "concept_source", "is_vm",
    "media_type", "media_product_type",
    "reach", "views", "like_count", "comments_count", "saved", "shares",
    "total_interactions", "engagement_rate",
    "ig_reels_avg_watch_time", "ig_reels_video_view_total_time",
    "caption_length", "hashtag_count", "hashtags", "first_line", "caption",
    "concept_reason", "permalink", "timestamp",
]


class MetaApiError(RuntimeError):
    pass


def api_get(path, params=None):
    """GET mot Graph API. Tokenet sendes i header, aldri i URL, print eller logg."""
    headers = {"Authorization": f"Bearer {TOKEN}"}
    resp = requests.get(f"{BASE_URL}/{path}", params=params, headers=headers, timeout=30)
    data = resp.json()
    if "error" in data:
        raise MetaApiError(data["error"].get("message", "Ukjent feil fra Meta"))
    return data


def fetch_all_media():
    """Henter alle innlegg, side for side."""
    posts = []
    params = {"fields": MEDIA_FIELDS, "limit": 50}
    while True:
        data = api_get(f"{IG_USER_ID}/media", params)
        posts.extend(data.get("data", []))
        paging = data.get("paging", {})
        if "next" not in paging:
            break
        params["after"] = paging["cursors"]["after"]
    return posts


def parse_insights(data):
    out = {}
    for item in data.get("data", []):
        if item.get("values"):
            out[item["name"]] = item["values"][0].get("value")
        else:
            out[item["name"]] = item.get("total_value", {}).get("value")
    return out


def fetch_insights(media):
    metrics = list(BASE_METRICS)
    if media.get("media_product_type") == "REELS":
        metrics += REELS_EXTRA
    try:
        return parse_insights(
            api_get(f"{media['id']}/insights", {"metric": ",".join(metrics)})
        )
    except MetaApiError:
        # Én ugyldig metric stopper hele kallet, så vi prøver én og én.
        result = {}
        for metric in metrics:
            try:
                result.update(
                    parse_insights(api_get(f"{media['id']}/insights", {"metric": metric}))
                )
            except MetaApiError:
                result[metric] = None
        return result


def enrich(post):
    """Legger til felt som analysen trenger: norsk tid, ukedag, hashtags osv."""
    caption = post.get("caption") or ""
    ts_local = datetime.strptime(post["timestamp"], "%Y-%m-%dT%H:%M:%S%z").astimezone(OSLO)
    hashtags = HASHTAG_RE.findall(caption)
    reach = post.get("reach")
    interactions = post.get("total_interactions")

    post.update({
        "timestamp_oslo": ts_local.strftime("%Y-%m-%d %H:%M"),
        "weekday": WEEKDAYS_NO[ts_local.weekday()],
        "hour": ts_local.hour,
        "caption_length": len(caption),
        "first_line": caption.split("\n")[0][:150],
        "hashtags": " ".join(hashtags),
        "hashtag_count": len(hashtags),
        "engagement_rate": (
            round(interactions / reach, 5) if reach and interactions is not None else None
        ),
    })
    return post


def save(posts):
    DATA_DIR.mkdir(exist_ok=True)
    with open(DATA_DIR / "posts.json", "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    extra = sorted({k for p in posts for k in p} - set(COLUMN_ORDER))
    columns = COLUMN_ORDER + extra
    # utf-8-sig gjør at Excel viser æøå riktig
    with open(DATA_DIR / "posts.csv", "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(posts)


def print_summary(posts):
    with_reach = [p for p in posts if p.get("reach")]
    if not with_reach:
        return
    print("\nTopp 5 etter rekkevidde:")
    for p in sorted(with_reach, key=lambda p: p["reach"], reverse=True)[:5]:
        rate = p.get("engagement_rate")
        rate_txt = f"{rate * 100:.2f} %" if rate is not None else "-"
        print(f"  {p['timestamp_oslo']}  reach {p['reach']:>7}  eng. {rate_txt:>7}  {p['first_line'][:50]}")


def main():
    if not TOKEN or not IG_USER_ID:
        sys.exit("Mangler META_ACCESS_TOKEN eller IG_USER_ID i .env-filen.")

    print("Henter innlegg ...")
    media = fetch_all_media()
    print(f"Fant {len(media)} innlegg. Henter innsikt ...")

    posts = []
    for i, m in enumerate(media, 1):
        m.update(fetch_insights(m))
        posts.append(enrich(m))
        print(f"  {i}/{len(media)}", end="\r", flush=True)
        time.sleep(0.2)  # skånsomt mot Metas rate limits

    apply_concepts(posts)
    save(posts)
    print(f"\nFerdig! Lagret {len(posts)} innlegg i {DATA_DIR}/posts.csv og posts.json")
    print_summary(posts)


if __name__ == "__main__":
    try:
        main()
    except MetaApiError as e:
        sys.exit(f"Feil fra Meta: {e}")
