"""
NM Insights - datainnhenter for YouTube (Data API v3 + Analytics API v2), kun lesetilgang.

Lagrer i Supabase:
  youtube_videos          metadata, format (Analytics creatorContentType) og konsept
  youtube_video_insights  dagens tall (morgen/kveld): Data API sanntid (hovedtall) og
                          Analytics kumulativt til og med analytics_end_date
  youtube_video_daily     Analytics per video per døgn (Stillehavstid)
  account_insights        abonnenter og antall videoer; nye abonnenter per døgn

Oppdateringsstrategi (som Instagram):
  - Videoer yngre enn 30 dager får nye tall hver kjøring; eldre hvis siste tall er eldre enn 7 dager.
  - Per-video Analytics (delinger, abonnenter): videoer yngre enn 30 dager hver kjøring,
    alle videoer én gang i uken.
  - Daglig historikk: videoer yngre enn 30 dager hentes fra publisering hver kjøring
    (Analytics justerer tall i ettertid). --backfill henter hele historikken for alle videoer
    og kanalens nye abonnenter per døgn siden kanalen ble opprettet.

Tokens, Authorization-headere og client secret skrives aldri ut og lagres aldri i raw.
data/youtube_videos.json skrives som lokal backup.

Kjør:  python fetch_youtube.py [--backfill]
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

import db
from concepts import VM_EVENT, apply_concepts
from fetch_instagram import DATA_DIR, OSLO, snapshot_slot
from retry import Failures, retry

load_dotenv()

DATA_URL = "https://www.googleapis.com/youtube/v3"
ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports"
TOKEN_URI = "https://oauth2.googleapis.com/token"

REFRESH_ALWAYS_DAYS = 30   # videoer yngre enn dette får nye tall hver kjøring
REFRESH_OLD_DAYS = 7       # eldre videoer: nye tall hvis siste tall er eldre enn dette
PER_VIDEO_DAYS = 30        # per-video Analytics hver kjøring for videoer yngre enn dette
DAILY_DAYS = 30            # daglig historikk hentes på nytt for videoer yngre enn dette
SUBSCRIBER_DAYS = 30       # nye abonnenter per døgn hentes på nytt for siste 30 dager
SHORTS_MAX_S = 180         # foreløpig format før Analytics har klassifisert videoen

LIFETIME_METRICS = ["views", "engagedViews", "estimatedMinutesWatched",
                    "averageViewDuration", "averageViewPercentage"]
PER_VIDEO_METRICS = ["likes", "comments", "shares", "subscribersGained", "subscribersLost"]
DAILY_METRICS = LIFETIME_METRICS + PER_VIDEO_METRICS
CONTENT_TYPES = {"shorts": "SHORTS", "videoOnDemand": "VIDEO"}
HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
DURATION_RE = re.compile(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


class YouTubeApiError(RuntimeError):
    """transient = forbigående (nettverk, HTTP 5xx/429, backendError o.l.) og verdt å prøve igjen."""

    def __init__(self, message, status=None, transient=False):
        super().__init__(message)
        self.status = status
        self.transient = transient


# Feilårsaker fra Google som går over av seg selv. quotaExceeded (dagskvoten) er ikke med.
TRANSIENT_REASONS = {"backendError", "internalError", "rateLimitExceeded", "userRateLimitExceeded"}


def is_transient(error):
    return getattr(error, "transient", False)


# --- Autentisering og API-kall -----------------------------------------------

class YouTube:
    """Leser fra YouTube med refresh token fra miljøet. Tokenet ligger bare i minnet."""

    def __init__(self):
        missing = [k for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN")
                   if not os.getenv(k)]
        if missing:
            sys.exit(f"Mangler {', '.join(missing)} i .env-filen.")
        self.creds = Credentials(
            token=None,
            refresh_token=os.environ["YOUTUBE_REFRESH_TOKEN"],
            client_id=os.environ["YOUTUBE_CLIENT_ID"],
            client_secret=os.environ["YOUTUBE_CLIENT_SECRET"],
            token_uri=TOKEN_URI,
        )
        self._refresh()

    def _refresh(self):
        try:
            self.creds.refresh(Request())
        except Exception as e:  # meldingen fra google-auth inneholder ikke tokens
            raise YouTubeApiError(f"Kunne ikke fornye tilgangen: {type(e).__name__}") from None

    def _get_once(self, url, params):
        if not self.creds.valid:
            self._refresh()
        try:
            resp = requests.get(url, params=params, timeout=60,
                                headers={"Authorization": f"Bearer {self.creds.token}"})
        except requests.RequestException as e:  # meldingen kan inneholde URL, så bare typen vises
            raise YouTubeApiError(f"Nettverksfeil ({type(e).__name__})", transient=True) from None
        try:
            data = resp.json()
        except ValueError:
            status = resp.status_code
            raise YouTubeApiError(f"Ugyldig svar fra YouTube (HTTP {status})", status,
                                  transient=status >= 500 or status == 429) from None
        if "error" in data:
            err = data["error"]
            status = resp.status_code
            reasons = {e.get("reason") for e in err.get("errors", [])}
            transient = status >= 500 or status == 429 or bool(reasons & TRANSIENT_REASONS)
            raise YouTubeApiError(f"{err.get('message', 'Ukjent feil fra YouTube')} (HTTP {status})",
                                  status, transient)
        return data

    def _get(self, url, params, what):
        return retry(lambda: self._get_once(url, params), what=what, is_transient=is_transient)

    def data(self, path, params):
        return self._get(f"{DATA_URL}/{path}", params, what=f"Data API {path}")

    def analytics(self, **params):
        """Returnerer liste av dict per rad."""
        what = " ".join(x for x in ("Analytics", params.get("dimensions"), params.get("filters")) if x)
        data = self._get(ANALYTICS_URL, {"ids": "channel==MINE", **params}, what=what)
        time.sleep(0.1)  # skånsomt mot kvoten
        cols = [h["name"] for h in data.get("columnHeaders", [])]
        return [dict(zip(cols, row)) for row in data.get("rows", [])]

    def assert_clean(self, obj):
        """Sikring: ingenting som lagres, skal inneholde token eller client secret."""
        text = json.dumps(obj, default=str)
        for secret in (self.creds.token, self.creds.refresh_token, self.creds.client_secret):
            if secret and secret in text:
                raise RuntimeError("Data til lagring inneholder en hemmelighet. Avbryter.")


# --- Henting ----------------------------------------------------------------

def fetch_channel(yt):
    items = yt.data("channels", {"part": "snippet,contentDetails,statistics", "mine": "true"})["items"]
    if not items:
        raise YouTubeApiError("Kontoen har ingen kanal.")
    return items[0]


def fetch_videos(yt, uploads_playlist):
    ids, page = [], None
    while True:
        params = {"part": "contentDetails", "playlistId": uploads_playlist, "maxResults": 50}
        if page:
            params["pageToken"] = page
        data = yt.data("playlistItems", params)
        ids += [i["contentDetails"]["videoId"] for i in data.get("items", [])]
        page = data.get("nextPageToken")
        if not page:
            break
    videos = []
    for i in range(0, len(ids), 50):
        data = yt.data("videos", {"part": "snippet,contentDetails,statistics", "id": ",".join(ids[i:i + 50])})
        videos += data.get("items", [])
    return videos


def analytics_end_date(yt, today):
    """Siste døgn Analytics har tall for (typisk 2–3 dager bak)."""
    rows = yt.analytics(startDate=(today - timedelta(days=14)).isoformat(), endDate=today.isoformat(),
                        metrics="views", dimensions="day", sort="day")
    return date.fromisoformat(rows[-1]["day"]) if rows else None


def lifetime_by_video(yt, start, end):
    rows, index = [], 1
    while True:
        page = yt.analytics(startDate=start, endDate=end, metrics=",".join(LIFETIME_METRICS),
                            dimensions="video", sort="-views", maxResults=200, startIndex=index)
        rows += page
        if len(page) < 200:
            return {r["video"]: r for r in rows}
        index += 200


def content_types(yt, start, end):
    """video-ID -> 'SHORTS'/'VIDEO' fra creatorContentType (2 kall i stedet for ett per video)."""
    result = {}
    for kind, fmt in CONTENT_TYPES.items():
        for row in yt.analytics(startDate=start, endDate=end, metrics="views", dimensions="video",
                                filters=f"creatorContentType=={kind}", sort="-views", maxResults=200):
            result[row["video"]] = fmt
    return result


def per_video_totals(yt, video_id, start, end):
    rows = yt.analytics(startDate=start, endDate=end, metrics=",".join(PER_VIDEO_METRICS),
                        filters=f"video=={video_id}")
    return rows[0] if rows else None


def daily_for_video(yt, video_id, start, end):
    return yt.analytics(startDate=start, endDate=end, metrics=",".join(DAILY_METRICS),
                        dimensions="day", filters=f"video=={video_id}", sort="day")


def channel_daily_subscribers(yt, start, end):
    return yt.analytics(startDate=start, endDate=end, metrics="subscribersGained,subscribersLost",
                        dimensions="day", sort="day")


# --- Bearbeiding ------------------------------------------------------------

def duration_seconds(iso):
    m = DURATION_RE.fullmatch(iso or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def to_post(video):
    """Samme felt som concepts.py forventer for Instagram-innlegg."""
    sn = video["snippet"]
    published = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
    caption = (sn.get("title") or "") + "\n" + (sn.get("description") or "")
    return {
        "id": video["id"],
        "published": published,
        "timestamp_oslo": published.astimezone(OSLO).strftime("%Y-%m-%d %H:%M"),
        "caption": caption,
        "hashtags": " ".join(HASHTAG_RE.findall(caption)),
        "video": video,
    }


def num(value, kind=int):
    return None if value is None else kind(value)


# --- Supabase ---------------------------------------------------------------

def recent_snapshots(account_id, since, only_per_video=False):
    params = {
        "select": "video_id,youtube_videos!inner(platform_video_id)",
        "youtube_videos.account_id": f"eq.{account_id}",
        "snapshot_date": f"gte.{since.isoformat()}",
        "order": "video_id",
    }
    if only_per_video:
        params["shares"] = "not.is.null"
    return {r["youtube_videos"]["platform_video_id"] for r in db.select("youtube_video_insights", params)}


def video_row(account_id, post, fmt, fmt_source, now_iso):
    v = post["video"]
    return {
        "account_id": account_id,
        "platform_video_id": v["id"],
        "published_at": post["published"].isoformat(),
        "title": v["snippet"].get("title"),
        "description": v["snippet"].get("description"),
        "duration_s": duration_seconds(v["contentDetails"].get("duration")),
        "format": fmt,
        "format_source": fmt_source,
        "hashtags": [h.lower() for h in post["hashtags"].split()],
        "permalink": f"https://www.youtube.com/shorts/{v['id']}" if fmt == "SHORTS"
                     else f"https://www.youtube.com/watch?v={v['id']}",
        "concept": post["concept"],
        "concept_source": post["concept_source"],
        "concept_reason": post["concept_reason"] or None,
        "special_event": VM_EVENT if post["is_vm"] else None,
        "last_seen_at": now_iso,
        "updated_at": now_iso,
    }


def insight_row(video_id, post, life, per_video, end_date, today, slot, now_iso):
    stats = post["video"].get("statistics", {})
    return {
        "video_id": video_id,
        "snapshot_date": today.isoformat(),
        "snapshot_slot": slot,
        "fetched_at": now_iso,
        "views": num(stats.get("viewCount")),
        "likes": num(stats.get("likeCount")),
        "comments": num(stats.get("commentCount")),
        "analytics_end_date": end_date.isoformat() if life and end_date else None,
        "a_views": num(life and life.get("views")),
        "engaged_views": num(life and life.get("engagedViews")),
        "estimated_minutes_watched": num(life and life.get("estimatedMinutesWatched"), float),
        "average_view_duration_s": num(life and life.get("averageViewDuration"), float),
        "average_view_percentage": num(life and life.get("averageViewPercentage"), float),
        "shares": num(per_video and per_video.get("shares")),
        "subscribers_gained": num(per_video and per_video.get("subscribersGained")),
        "subscribers_lost": num(per_video and per_video.get("subscribersLost")),
        "raw": {"video": post["video"], "analytics": life, "per_video": per_video},
    }


def daily_rows(video_id, rows, now_iso):
    return [{
        "video_id": video_id,
        "day": r["day"],
        "views": num(r.get("views")),
        "engaged_views": num(r.get("engagedViews")),
        "estimated_minutes_watched": num(r.get("estimatedMinutesWatched"), float),
        "average_view_duration_s": num(r.get("averageViewDuration"), float),
        "average_view_percentage": num(r.get("averageViewPercentage"), float),
        "likes": num(r.get("likes")),
        "comments": num(r.get("comments")),
        "shares": num(r.get("shares")),
        "subscribers_gained": num(r.get("subscribersGained")),
        "subscribers_lost": num(r.get("subscribersLost")),
        "fetched_at": now_iso,
    } for r in rows]


def save_channel(yt, account_id, channel, today, now_iso, start, failures):
    stats = channel.get("statistics", {})
    raw = {"id": channel["id"], "title": channel["snippet"].get("title"), "statistics": stats}
    yt.assert_clean(raw)
    db.upsert("account_insights", [{
        "account_id": account_id,
        "snapshot_date": today.isoformat(),
        "fetched_at": now_iso,
        "followers_count": num(stats.get("subscriberCount")),
        "follows_count": None,
        "media_count": num(stats.get("videoCount")),
        "raw": raw,
    }], on_conflict="account_id,snapshot_date")

    subscribers = failures.soft("nye abonnenter per døgn",
                                lambda: channel_daily_subscribers(yt, start.isoformat(), today.isoformat()), [])
    days = [r for r in subscribers if date.fromisoformat(r["day"]) < today]
    if days:
        # Dager uten rad fra før: ny rad med rått svar (abonnenttotal finnes ikke bakover)
        db.upsert("account_insights", [{
            "account_id": account_id,
            "snapshot_date": r["day"],
            "fetched_at": now_iso,
            "new_followers": num(r.get("subscribersGained")),
            "raw": {"source": "youtube_analytics_subscribers", "day_timezone": "America/Los_Angeles",
                    "subscribers_gained": r.get("subscribersGained"),
                    "subscribers_lost": r.get("subscribersLost")},
        } for r in days], on_conflict="account_id,snapshot_date", ignore_duplicates=True)
        # Alle dager i vinduet: oppdater bare new_followers
        db.upsert("account_insights", [{
            "account_id": account_id, "snapshot_date": r["day"],
            "new_followers": num(r.get("subscribersGained")),
        } for r in days], on_conflict="account_id,snapshot_date")
    return stats, len(days)


def save_backup(posts, formats, life):
    DATA_DIR.mkdir(exist_ok=True)
    out = [{
        "id": p["id"], "published_oslo": p["timestamp_oslo"], "title": p["video"]["snippet"].get("title"),
        "format": formats[p["id"]][0], "concept": p["concept"], "concept_source": p["concept_source"],
        "is_vm": p["is_vm"], "statistics": p["video"].get("statistics"), "analytics": life.get(p["id"]),
    } for p in posts]
    with open(DATA_DIR / "youtube_videos.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


# --- Kjøring ----------------------------------------------------------------

def main(backfill=False):
    now = datetime.now(OSLO)
    now_iso, today, slot = now.isoformat(), now.date(), snapshot_slot(now)
    yt = YouTube()
    failures = Failures(YouTubeApiError)

    # Kanal og videoliste er nødvendige: feiler de etter retry, stopper kjøringen.
    channel = fetch_channel(yt)
    account_id = db.get_account("youtube", channel["id"])["id"]
    channel_start = date.fromisoformat(channel["snippet"]["publishedAt"][:10])
    uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]

    print("Henter videoer ...")
    videos = fetch_videos(yt, uploads)
    posts = [to_post(v) for v in videos]
    apply_concepts(posts, platform="youtube")

    print("Henter Analytics ...")
    # Analytics kan hoppes over: da lagres Data API-tallene, og formatet settes etter varighet.
    end_date = failures.soft("siste døgn med Analytics", lambda: analytics_end_date(yt, today))
    start = channel_start.isoformat()
    life = failures.soft("Analytics per video", lambda: lifetime_by_video(yt, start, today.isoformat()), {})
    types = failures.soft("format (creatorContentType)", lambda: content_types(yt, start, today.isoformat()), {})

    formats = {}
    for p in posts:
        if p["id"] in types:
            formats[p["id"]] = (types[p["id"]], "analytics")
        else:
            seconds = duration_seconds(p["video"]["contentDetails"].get("duration")) or 0
            formats[p["id"]] = ("SHORTS" if seconds <= SHORTS_MAX_S else "VIDEO", "varighet")

    def age(p):
        return now - p["published"].astimezone(OSLO)

    fresh = recent_snapshots(account_id, today - timedelta(days=REFRESH_OLD_DAYS - 1))
    per_video_fresh = recent_snapshots(account_id, today - timedelta(days=REFRESH_OLD_DAYS - 1),
                                       only_per_video=True)
    to_snapshot = [p for p in posts if age(p) < timedelta(days=REFRESH_ALWAYS_DAYS) or p["id"] not in fresh]
    per_video_ids = {p["id"] for p in posts
                     if age(p) < timedelta(days=PER_VIDEO_DAYS) or p["id"] not in per_video_fresh}

    # Videoer Analytics ikke har behandlet ennå, gir nuller som betyr «ikke tilgjengelig».
    # De hoppes over, så shares/abonnenter blir null (ikke hentet) i stedet for 0.
    per_video_targets = [p for p in to_snapshot if p["id"] in per_video_ids and p["id"] in life]
    per_video = {}
    for i, p in enumerate(per_video_targets, 1):
        # null = ikke hentet i denne kjøringen
        per_video[p["id"]] = failures.soft(f"per-video Analytics for {p['id']}",
                                           lambda: per_video_totals(yt, p["id"], start, today.isoformat()))
        print(f"  per-video {i}/{len(per_video_targets)}", end="\r", flush=True)

    print("\nLagrer i Supabase ...")
    rows = [video_row(account_id, p, *formats[p["id"]], now_iso) for p in posts]
    yt.assert_clean(rows)
    saved = db.upsert("youtube_videos", rows, on_conflict="account_id,platform_video_id",
                      returning="id,platform_video_id")
    video_ids = {r["platform_video_id"]: r["id"] for r in saved}

    insights = [insight_row(video_ids[p["id"]], p, life.get(p["id"]), per_video.get(p["id"]),
                            end_date, today, slot, now_iso) for p in to_snapshot]
    yt.assert_clean(insights)
    db.upsert("youtube_video_insights", insights, on_conflict="video_id,snapshot_date,snapshot_slot")

    daily_targets = posts if backfill else [p for p in posts if age(p) < timedelta(days=DAILY_DAYS)]
    daily_count = 0
    for i, p in enumerate(daily_targets, 1):
        published_day = p["published"].date()  # UTC-dato; Analytics bruker Stillehavstid, som er samme eller dagen før
        rows = failures.soft(f"daglig Analytics for {p['id']}",
                             lambda: daily_for_video(yt, p["id"], (published_day - timedelta(days=1)).isoformat(),
                                                     today.isoformat()), [])
        rows = [r for r in rows if r.get("views") or r.get("estimatedMinutesWatched")
                or date.fromisoformat(r["day"]) >= published_day]
        if rows:
            db.upsert("youtube_video_daily", daily_rows(video_ids[p["id"]], rows, now_iso),
                      on_conflict="video_id,day")
            daily_count += len(rows)
        print(f"  daglig {i}/{len(daily_targets)}", end="\r", flush=True)

    sub_start = channel_start if backfill else today - timedelta(days=SUBSCRIBER_DAYS)
    stats, sub_days = save_channel(yt, account_id, channel, today, now_iso, sub_start, failures)
    save_backup(posts, formats, life)

    print(f"\nFerdig! {len(saved)} videoer, {len(insights)} øyeblikksbilder ({slot}), "
          f"{len(per_video)} per-video-kall, {daily_count} daglige rader for {len(daily_targets)} videoer.")
    print(f"Kanalen: {stats.get('subscriberCount')} abonnenter, {stats.get('videoCount')} videoer. "
          f"Nye abonnenter oppdatert for {sub_days} døgn. Analytics dekker til og med {end_date}.")
    print(f"Lokal backup: {DATA_DIR}/youtube_videos.json")
    failures.finish(saved_anything=bool(saved), name="YouTube")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Hent YouTube-data til Supabase.")
    parser.add_argument("--backfill", action="store_true",
                        help="Hent daglig historikk for alle videoer og nye abonnenter siden kanalstart")
    args = parser.parse_args()
    try:
        main(backfill=args.backfill)
    except YouTubeApiError as e:
        sys.exit(f"Feil fra YouTube: {e}")
    except db.SupabaseError as e:
        sys.exit(f"Feil fra Supabase: {e}")
