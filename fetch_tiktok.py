"""
NM Insights - datainnhenter for TikTok (Accounts API v1.3), kun lesetilgang.

Lagrer i Supabase:
  tiktok_videos          metadata (caption, VIDEO/PHOTO, is_ad) og konsept
  tiktok_video_insights  dagens levetidstall per innlegg (morgen/kveld). TikTok oppdaterer tallene med
                         24-48 timers forsinkelse. Dype mål (reach, seertid) kan mangle for innlegg uten
                         aktivitet de siste 7 dagene; da er de null i den målingen.
  account_insights       følgere, følger, antall videoer (sanntid) for dagens dato (Oslo)

Oppdateringsstrategi (som Instagram og YouTube):
  - Innlegg yngre enn 30 dager får nye tall hver kjøring; eldre hvis siste tall er eldre enn 7 dager.
  - --backfill lagrer en måling for alle innlegg.
  Alle innlegg hentes i listekallet uansett (ett kall per 20 innlegg), så strategien sparer bare rader.

Felt som krever Business-konto (profile_views per innlegg) hentes bare når kontoen er det; ellers null.
--dry-run henter og viser hvilke felt som kom tilbake, uten å lagre data (bare et eventuelt nytt
refresh-token lagres, se tiktok_api.py). data/tiktok_videos.json skrives som lokal backup.

Kjør:  python fetch_tiktok.py [--backfill] [--dry-run]
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import db
from concepts import VM_EVENT, apply_concepts
from fetch_instagram import DATA_DIR, OSLO, snapshot_slot
from tiktok_api import (PROFILE_FIELDS, VIDEO_FIELDS, TikTok, TikTokApiError, business_fields,
                        print_field_report, tiktok_accounts)

REFRESH_ALWAYS_DAYS = 30
REFRESH_OLD_DAYS = 7
HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
# Konseptreglene skiller Reels og feed; på TikTok tilsvarer VIDEO Reels og PHOTO feed.
RULE_FORMAT = {"VIDEO": "REELS", "PHOTO": "FEED"}


def num(value, kind=int):
    return None if value is None else kind(value)


def clean_url(url):
    """share_url uten utm-parametere (TikTok legger på utm_campaign og utm_source)."""
    if not url:
        return None
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, "", ""))


def to_post(video):
    """Samme felt som concepts.py forventer."""
    published = datetime.fromtimestamp(int(video["create_time"]), tz=timezone.utc)
    caption = video.get("caption") or ""
    return {
        "id": str(video["item_id"]),
        "published": published,
        "timestamp_oslo": published.astimezone(OSLO).strftime("%Y-%m-%d %H:%M"),
        "caption": caption,
        "hashtags": " ".join(HASHTAG_RE.findall(caption)),
        "media_product_type": RULE_FORMAT.get(video.get("media_type") or "VIDEO", "REELS"),
        "video": video,
    }


def video_row(account_id, post, now_iso):
    v = post["video"]
    return {
        "account_id": account_id,
        "platform_video_id": post["id"],
        "published_at": post["published"].isoformat(),
        "caption": post["caption"] or None,
        "media_type": v.get("media_type") or None,
        "duration_s": num(v.get("video_duration"), float),
        "is_ad": v.get("is_ad"),
        "hashtags": [h.lower() for h in post["hashtags"].split()],
        "permalink": clean_url(v.get("share_url")),
        "concept": post["concept"],
        "concept_source": post["concept_source"],
        "concept_reason": post["concept_reason"] or None,
        "special_event": VM_EVENT if post["is_vm"] else None,
        "last_seen_at": now_iso,
        "updated_at": now_iso,
    }


def reach_value(v):
    """TikTok gir reach = 0 før tallet er behandlet, selv om innlegget har visninger (sett 13.10.2026 på et
    innlegg ett døgn gammelt). 0 rekkevidde med visninger er umulig, så det lagres som null (ikke klart)."""
    reach = num(v.get("reach"))
    return None if reach == 0 and (num(v.get("video_views")) or 0) > 0 else reach


def insight_row(video_id, post, today, slot, now_iso):
    v = post["video"]
    return {
        "video_id": video_id,
        "snapshot_date": today.isoformat(),
        "snapshot_slot": slot,
        "fetched_at": now_iso,
        "views": num(v.get("video_views")),
        "likes": num(v.get("likes")),
        "comments": num(v.get("comments")),
        "shares": num(v.get("shares")),
        "favorites": num(v.get("favorites")),
        "reach": reach_value(v),
        "total_time_watched_s": num(v.get("total_time_watched"), float),
        "average_time_watched_s": num(v.get("average_time_watched"), float),
        "full_video_watched_rate": num(v.get("full_video_watched_rate"), float),
        "new_followers": num(v.get("new_followers")),
        "profile_views": num(v.get("profile_views")),   # null når kontoen ikke er Business
        "raw": {"video": {k: x for k, x in v.items() if k not in ("thumbnail_url", "embed_url")}},
    }


def recent_snapshots(account_id, since):
    rows = db.select("tiktok_video_insights", {
        "select": "video_id,tiktok_videos!inner(platform_video_id)",
        "tiktok_videos.account_id": f"eq.{account_id}",
        "snapshot_date": f"gte.{since.isoformat()}",
        "order": "video_id",
    })
    return {r["tiktok_videos"]["platform_video_id"] for r in rows}


def run_account(account, backfill, dry_run, now):
    now_iso, today, slot = now.isoformat(), now.date(), snapshot_slot(now)
    tt = TikTok(account["id"], dry_run=dry_run)
    print(f"TikTok @{account.get('username') or '?'} (konto {account['id']})"
          f"{' - nytt refresh-token lagret' if tt.rotated else ''}")

    profile = tt.profile(PROFILE_FIELDS)
    _, extra_video = business_fields(profile)
    print(f"  Business-konto: {profile.get('is_business_account')}, Advanced Access: {profile.get('has_advanced_access')}")
    print(f"  Følgere {profile.get('followers_count')}, følger {profile.get('following_count')}, "
          f"videoer {profile.get('videos_count')}, likes totalt {profile.get('total_likes')}")

    video_fields = VIDEO_FIELDS + extra_video
    videos = tt.videos(video_fields)
    posts = [to_post(v) for v in videos]
    apply_concepts(posts, platform="tiktok")
    print_field_report("Innlegg", videos, video_fields)
    if not extra_video:
        print("  (profile_views per innlegg krever Business-konto: ikke hentet, lagres som null)")

    DATA_DIR.mkdir(exist_ok=True)
    backup = [{"id": p["id"], "published_oslo": p["timestamp_oslo"], "concept": p["concept"],
               "concept_source": p["concept_source"], "concept_reason": p["concept_reason"],
               "is_vm": p["is_vm"], "video": p["video"]} for p in posts]
    tt.assert_clean(backup)
    with open(DATA_DIR / "tiktok_videos.json", "w", encoding="utf-8") as f:
        json.dump({"profile": profile, "videos": backup}, f, ensure_ascii=False, indent=2)

    if dry_run:
        print(f"  --dry-run: {len(posts)} innlegg hentet, ingenting lagret. Se data/tiktok_videos.json.")
        return len(posts)

    rows = [video_row(account["id"], p, now_iso) for p in posts]
    tt.assert_clean(rows)
    saved = db.upsert("tiktok_videos", rows, on_conflict="account_id,platform_video_id",
                      returning="id,platform_video_id") if rows else []
    video_ids = {r["platform_video_id"]: r["id"] for r in saved}

    fresh = set() if backfill else recent_snapshots(account["id"], today - timedelta(days=REFRESH_OLD_DAYS - 1))
    to_snapshot = [p for p in posts
                   if backfill or now - p["published"] < timedelta(days=REFRESH_ALWAYS_DAYS) or p["id"] not in fresh]
    insights = [insight_row(video_ids[p["id"]], p, today, slot, now_iso) for p in to_snapshot]
    tt.assert_clean(insights)
    if insights:
        db.upsert("tiktok_video_insights", insights, on_conflict="video_id,snapshot_date,snapshot_slot")

    raw = {k: profile.get(k) for k in PROFILE_FIELDS}
    tt.assert_clean(raw)
    db.upsert("account_insights", [{
        "account_id": account["id"],
        "snapshot_date": today.isoformat(),
        "fetched_at": now_iso,
        "followers_count": num(profile.get("followers_count")),
        "follows_count": num(profile.get("following_count")),
        "media_count": num(profile.get("videos_count")),
        "raw": {"source": "tiktok_business_get", **raw},
    }], on_conflict="account_id,snapshot_date")

    print(f"  Lagret {len(saved)} innlegg og {len(insights)} målinger ({slot}).")
    return len(saved)


def main():
    parser = argparse.ArgumentParser(description="Hent TikTok-data til Supabase.")
    parser.add_argument("--backfill", action="store_true", help="Lagre en måling for alle innlegg")
    parser.add_argument("--dry-run", action="store_true", help="Hent og vis feltene uten å lagre data")
    args = parser.parse_args()

    accounts = tiktok_accounts()
    if not accounts:
        sys.exit("Ingen koblede TikTok-kontoer.")
    saved = 0
    for account in accounts:
        saved += run_account(account, args.backfill, args.dry_run, datetime.now(OSLO))
    if not saved:
        sys.exit("TikTok: ingenting ble hentet.")


if __name__ == "__main__":
    try:
        main()
    except TikTokApiError as e:
        sys.exit(f"Feil fra TikTok: {e}")
    except db.SupabaseError as e:
        sys.exit(f"Feil fra Supabase: {e}")
