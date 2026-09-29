"""
NM Insights - datainnhenter for Instagram (Meta Graph API).

Henter innlegg + innsiktstall for én Instagram-konto og lagrer dem i Supabase:
  posts             metadata og konsept (alle innlegg, hver kjøring)
  post_insights     dagens tall, med hele API-svaret i raw
  account_insights  følgere, fulgte og antall innlegg (hver kjøring), og
                    nye følgere per dag for de siste 30 dagene (Metas maks)

Oppdateringsstrategi: innlegg fra de siste 30 dagene får nye tall hver
kjøring, eldre innlegg bare hvis de ikke har fått nye tall siste 7 dager.

data/posts.json og data/posts.csv skrives fortsatt som lokal backup.

Kjør:  python fetch_instagram.py
"""
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv

import db
from concepts import VM_EVENT, apply_concepts

load_dotenv()

TOKEN = os.getenv("META_ACCESS_TOKEN")
IG_USER_ID = os.getenv("IG_USER_ID")
API_VERSION = os.getenv("GRAPH_API_VERSION", "v26.0")
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
OSLO = ZoneInfo("Europe/Oslo")
DATA_DIR = Path("data")

REFRESH_ALWAYS_DAYS = 30  # innlegg yngre enn dette får nye tall hver kjøring
REFRESH_OLD_DAYS = 7      # eldre innlegg: nye tall hvis siste tall er eldre enn dette
FOLLOWER_HISTORY_DAYS = 30  # maks Meta gir for follower_count

MEDIA_FIELDS = (
    "id,caption,media_type,media_product_type,timestamp,"
    "like_count,comments_count,permalink"
)
ACCOUNT_FIELDS = "username,followers_count,follows_count,media_count"

# Metrics vi prøver å hente. Meta endrer disse av og til, så skriptet
# tåler at enkelte metrics ikke støttes for en gitt innleggstype.
BASE_METRICS = ["reach", "views", "saved", "shares", "total_interactions"]
REELS_EXTRA = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]
INSIGHT_KEYS = BASE_METRICS + REELS_EXTRA + ["like_count", "comments_count", "insights_date"]

WEEKDAYS_NO = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)

COLUMN_ORDER = [
    "id", "timestamp_oslo", "weekday", "hour", "concept", "concept_source", "is_vm",
    "media_type", "media_product_type", "insights_date",
    "reach", "views", "like_count", "comments_count", "saved", "shares",
    "total_interactions", "engagement_rate",
    "ig_reels_avg_watch_time", "ig_reels_video_view_total_time",
    "caption_length", "hashtag_count", "hashtags", "first_line", "caption",
    "concept_reason", "permalink", "timestamp",
]


class MetaApiError(RuntimeError):
    pass


# --- Meta Graph API ----------------------------------------------------------

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
    """Returnerer (tall, rå API-data) for ett innlegg."""
    metrics = list(BASE_METRICS)
    if media.get("media_product_type") == "REELS":
        metrics += REELS_EXTRA
    try:
        data = api_get(f"{media['id']}/insights", {"metric": ",".join(metrics)})
        return parse_insights(data), data.get("data", [])
    except MetaApiError:
        # Én ugyldig metric stopper hele kallet, så vi prøver én og én.
        result, raw = {}, []
        for metric in metrics:
            try:
                data = api_get(f"{media['id']}/insights", {"metric": metric})
                result.update(parse_insights(data))
                raw.extend(data.get("data", []))
            except MetaApiError:
                result[metric] = None
        return result, raw


def fetch_account():
    return api_get(IG_USER_ID, {"fields": ACCOUNT_FIELDS})


def fetch_follower_history():
    """Nye følgere per dag de siste 30 dagene (Meta gir ikke totalen bakover)."""
    now = int(time.time())
    data = api_get(f"{IG_USER_ID}/insights", {
        "metric": "follower_count",
        "period": "day",
        "since": now - FOLLOWER_HISTORY_DAYS * 86400,
        "until": now,
    })
    return data.get("data", [])


def assert_no_token(obj):
    """Sikring: rå API-svar skal aldri inneholde tokenet før de lagres."""
    if TOKEN and TOKEN in json.dumps(obj):
        raise RuntimeError("Rått API-svar inneholder tokenet. Avbryter lagring.")


# --- Bearbeiding -------------------------------------------------------------

def parse_timestamp(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z")


def enrich(post):
    """Legger til felt som analysen trenger: norsk tid, ukedag, hashtags osv."""
    caption = post.get("caption") or ""
    ts_local = parse_timestamp(post["timestamp"]).astimezone(OSLO)
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


def load_backup():
    path = DATA_DIR / "posts.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return {p["id"]: p for p in json.load(f)}


def recently_refreshed(account_id, since_date):
    """platform_post_id for innlegg som har fått tall fra og med since_date."""
    rows = db.select("post_insights", {
        "select": "post_id,posts!inner(platform_post_id)",
        "posts.account_id": f"eq.{account_id}",
        "snapshot_date": f"gte.{since_date.isoformat()}",
        "order": "post_id",
    })
    return {r["posts"]["platform_post_id"] for r in rows}


# --- Lagring -----------------------------------------------------------------

def post_row(account_id, post, now_iso):
    return {
        "account_id": account_id,
        "platform_post_id": post["id"],
        "published_at": parse_timestamp(post["timestamp"]).isoformat(),
        "media_type": post.get("media_type"),
        "media_product_type": post.get("media_product_type"),
        "caption": post.get("caption"),
        "hashtags": [h.lower() for h in post["hashtags"].split()],
        "permalink": post.get("permalink"),
        "concept": post["concept"],
        "concept_source": post["concept_source"],
        "concept_reason": post["concept_reason"] or None,
        "special_event": VM_EVENT if post["is_vm"] else None,
        "last_seen_at": now_iso,
        "updated_at": now_iso,
    }


def insight_row(post_id, post, raw, today, now_iso):
    return {
        "post_id": post_id,
        "snapshot_date": today.isoformat(),
        "fetched_at": now_iso,
        "reach": post.get("reach"),
        "views": post.get("views"),
        "likes": post.get("like_count"),
        "comments": post.get("comments_count"),
        "saved": post.get("saved"),
        "shares": post.get("shares"),
        "total_interactions": post.get("total_interactions"),
        "avg_watch_time_ms": post.get("ig_reels_avg_watch_time"),
        "total_watch_time_ms": post.get("ig_reels_video_view_total_time"),
        "raw": raw,
    }


def save_account_insights(account_id, today, now_iso):
    """Dagens kontotall og nye følgere per dag. Returnerer (kontotall, antall dager med new_followers)."""
    account = fetch_account()
    assert_no_token(account)
    db.upsert("account_insights", [{
        "account_id": account_id,
        "snapshot_date": today.isoformat(),
        "fetched_at": now_iso,
        "followers_count": account.get("followers_count"),
        "follows_count": account.get("follows_count"),
        "media_count": account.get("media_count"),
        "raw": account,
    }], on_conflict="account_id,snapshot_date")

    try:
        history = fetch_follower_history()
    except MetaApiError as e:
        print(f"Kunne ikke hente følgerhistorikk: {e}")
        history = []
    assert_no_token(history)

    days = {}
    for metric in history:
        for value in metric.get("values", []):
            # end_time kl. 07:00 UTC markerer slutten av Metas døgn (Stillehavstid),
            # så verdien gjelder dagen før. Dagens døgn er ikke ferdig ennå.
            day = parse_timestamp(value["end_time"]).date() - timedelta(days=1)
            if day < today:
                days[day] = value

    if days:
        # Dager uten rad fra før: ny rad med rått svar (followers_count finnes ikke bakover)
        db.upsert("account_insights", [{
            "account_id": account_id,
            "snapshot_date": day.isoformat(),
            "fetched_at": now_iso,
            "new_followers": value.get("value"),
            "raw": {
                "source": "follower_count_backfill",
                "new_followers": value.get("value"),
                "end_time": value.get("end_time"),
            },
        } for day, value in days.items()], on_conflict="account_id,snapshot_date",
            ignore_duplicates=True)
        # Alle dager i vinduet: oppdater bare new_followers, resten av raden står urørt
        db.upsert("account_insights", [{
            "account_id": account_id,
            "snapshot_date": day.isoformat(),
            "new_followers": value.get("value"),
        } for day, value in days.items()], on_conflict="account_id,snapshot_date")

    # Eldre historikkrader utenfor Metas 30-dagersvindu: fyll new_followers fra raw
    old = db.select("account_insights", {
        "select": "snapshot_date,raw",
        "account_id": f"eq.{account_id}",
        "new_followers": "is.null",
        "raw->>source": "eq.follower_count_backfill",
        "order": "snapshot_date",
    })
    if old:
        db.upsert("account_insights", [{
            "account_id": account_id,
            "snapshot_date": r["snapshot_date"],
            "new_followers": r["raw"].get("new_followers"),
        } for r in old], on_conflict="account_id,snapshot_date")

    return account, len(days) + len(old)


def save_backup(posts):
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


# Brukes av concepts.py når konsepter merkes på nytt lokalt
save = save_backup


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

    now = datetime.now(OSLO)
    now_iso = now.isoformat()
    today = now.date()
    account_id = db.get_account("instagram", IG_USER_ID)["id"]

    print("Henter innlegg ...")
    media = fetch_all_media()
    fresh = recently_refreshed(account_id, today - timedelta(days=REFRESH_OLD_DAYS - 1))
    backup = load_backup()

    to_refresh = [
        m for m in media
        if now - parse_timestamp(m["timestamp"]) < timedelta(days=REFRESH_ALWAYS_DAYS)
        or m["id"] not in fresh
    ]
    print(f"Fant {len(media)} innlegg. Henter nye tall for {len(to_refresh)} ...")

    raw_by_id = {}
    for i, m in enumerate(to_refresh, 1):
        raw_media = dict(m)
        insights, raw_insights = fetch_insights(m)
        m.update(insights)
        m["insights_date"] = today.isoformat()
        raw_by_id[m["id"]] = {"media": raw_media, "insights": raw_insights}
        print(f"  {i}/{len(to_refresh)}", end="\r", flush=True)
        time.sleep(0.2)  # skånsomt mot Metas rate limits

    # Innlegg som ikke oppdateres i dag beholder forrige tall i den lokale backupen
    for m in media:
        if m["id"] not in raw_by_id and m["id"] in backup:
            prev = backup[m["id"]]
            m.update({k: prev[k] for k in INSIGHT_KEYS if k in prev and k not in m})

    posts = [enrich(m) for m in media]
    apply_concepts(posts)
    assert_no_token(raw_by_id)

    print("\nLagrer i Supabase ...")
    saved = db.upsert(
        "posts", [post_row(account_id, p, now_iso) for p in posts],
        on_conflict="account_id,platform_post_id", returning="id,platform_post_id",
    )
    post_ids = {r["platform_post_id"]: r["id"] for r in saved}
    insight_rows = [
        insight_row(post_ids[p["id"]], p, raw_by_id[p["id"]], today, now_iso)
        for p in posts if p["id"] in raw_by_id
    ]
    db.upsert("post_insights", insight_rows, on_conflict="post_id,snapshot_date")
    account, follower_days = save_account_insights(account_id, today, now_iso)

    save_backup(posts)
    print(f"Ferdig! {len(saved)} innlegg og {len(insight_rows)} innsiktsrader lagret i Supabase.")
    print(f"Kontoen: {account.get('followers_count')} følgere, {account.get('follows_count')} fulgte, "
          f"{account.get('media_count')} innlegg."
          + f" Nye følgere oppdatert for {follower_days} dager.")
    print(f"Lokal backup: {DATA_DIR}/posts.json og posts.csv")
    print_summary(posts)


if __name__ == "__main__":
    try:
        main()
    except MetaApiError as e:
        sys.exit(f"Feil fra Meta: {e}")
    except db.SupabaseError as e:
        sys.exit(f"Feil fra Supabase: {e}")
