"""
NM Insights - daglig aktivitet per konto og format → public.account_daily

Instagram: Meta /{ig}/insights med metric_type=total_value og breakdown=media_product_type,
           ett kall per døgn (Metas døgn følger Stillehavstid). Data finnes bare 2 år bakover.
YouTube:   Analytics dimensions=day,creatorContentType (+ dimensions=day for hele kanalen).
           Stillehavsdøgn, 2–3 døgn forsinkelse.
TikTok:    /business/get/ med start_date/end_date: per UTC-døgn (ikke Stillehavstid), 24–48 t forsinkelse,
           maks 60 døgn bakover. Bare format ALL (TikTok deler ikke opp kontotallene). saves finnes ikke
           (null). Følgertotal per døgn lagres i account_insights; nye følgere bare for Business/Advanced
           Access-kontoer, ellers null. Døgn TikTok ikke har tall for ennå, lagres ikke.

Vanlig kjøring henter de siste 7 døgnene på nytt (tallene kan justeres noen dager i etterkant).
--backfill henter Instagram så langt tilbake som Meta tillater, YouTube fra 04.06.2026 og TikTok 60 døgn.
Samme døgn + format oppdaterer raden (idempotent).

Kjør:  python fetch_daily.py [--backfill] [--only instagram|youtube|tiktok] [--dry-run]
"""
import argparse
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import db
import fetch_instagram as ig
import fetch_youtube as yt_mod
import tiktok_api as tt_mod
from retry import Failures

PACIFIC = ZoneInfo("America/Los_Angeles")
RECENT_DAYS = 7
IG_HISTORY_DAYS = 730                  # Meta: data bare 2 år tilbake
YT_BACKFILL_START = date(2026, 6, 4)   # kanalen ble opprettet 04.06.2026
SAVE_EVERY = 30                        # backfill: lagre underveis

IG_METRICS = ["views", "likes", "comments", "shares", "saves", "total_interactions"]
IG_FORMATS = {"REEL": "REELS", "POST": "FEED", "CAROUSEL_CONTAINER": "FEED", "CAROUSEL_ITEM": "FEED",
              "STORY": "STORY", "AD": "AD"}            # alt annet → OTHER
# Alle formatene som lagres for Instagram. Mangler et format i Metas svar, lagres 0, så en ny henting
# alltid overskriver hele døgnet (gamle rader for et format kan ellers bli stående med feil tall).
IG_ALL_FORMATS = ["ALL", "REELS", "FEED", "STORY", "AD", "OTHER"]
YT_METRICS = ["views", "likes", "comments", "shares"]
YT_FORMATS = {"shorts": "SHORTS", "videoOnDemand": "VIDEO", "liveStream": "LIVE"}  # alt annet → OTHER
TT_HISTORY_DAYS = 60                   # TikTok: maks 60 døgn bakover
TT_METRICS = ["views", "likes", "comments", "shares"]


def pacific_today():
    return datetime.now(PACIFIC).date()


def days(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def ts(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=PACIFIC).timestamp())


def ig_day_window(day):
    """since/until for ett Stillehavsdøgn hos Meta.

    Meta tar med hvert døgn der midnatt (Stillehavstid) ligger i [since, until], grensen inkludert.
    until = neste midnatt ga derfor to døgn per kall (rettet 05.10.2026). until = 23:59:59 gir bare
    dette døgnet."""
    since = ts(day)
    return since, since + 86399


def row(account_id, day, fmt, values, interactions, raw, saves=True):
    return {
        "account_id": account_id, "activity_date": day.isoformat(), "format": fmt,
        "views": values.get("views", 0), "likes": values.get("likes", 0),
        "comments": values.get("comments", 0), "shares": values.get("shares", 0),
        "saves": values.get("saves", 0) if saves else None,
        "interactions": interactions, "raw": raw,
        "fetched_at": datetime.now(PACIFIC).isoformat(),
    }


# --- Instagram ----------------------------------------------------------------

def ig_day(account_id, day):
    """Rader for ett Stillehavsdøgn: ALL + ett per format (FEED slår sammen bilder og karuseller)."""
    since, until = ig_day_window(day)
    data = ig.api_get(f"{ig.IG_USER_ID}/insights", {
        "metric": ",".join(IG_METRICS), "period": "day", "metric_type": "total_value",
        "breakdown": "media_product_type", "since": since, "until": until,
    })
    total, parts = {}, defaultdict(dict)   # parts: Metas type → {metric: verdi}
    for m in data.get("data", []):
        tv = m.get("total_value", {})
        total[m["name"]] = tv.get("value", 0) or 0
        for b in tv.get("breakdowns", []):
            for res in b.get("results", []):
                parts[res["dimension_values"][0]][m["name"]] = res.get("value", 0) or 0

    grouped = defaultdict(lambda: (defaultdict(int), {}))
    for meta_type, values in parts.items():
        sums, raw = grouped[IG_FORMATS.get(meta_type, "OTHER")]
        for k, v in values.items():
            sums[k] += v
        raw[meta_type] = values

    rows = [row(account_id, day, "ALL", total, total.get("total_interactions", 0), {"ALL": total})]
    for fmt in IG_ALL_FORMATS[1:]:
        sums, raw = grouped[fmt] if fmt in grouped else ({}, {})  # 0-rad når formatet mangler i svaret
        rows.append(row(account_id, day, fmt, sums, sums.get("total_interactions", 0), raw))
    return rows


def run_instagram(backfill, dry_run):
    account_id = None if dry_run else db.get_account("instagram", ig.IG_USER_ID)["id"]
    end = pacific_today() - timedelta(days=1)          # siste hele Stillehavsdøgn
    start = (pacific_today() - timedelta(days=IG_HISTORY_DAYS - 1)) if backfill else end - timedelta(days=RECENT_DAYS - 1)
    print(f"Instagram: henter {start} → {end} (Stillehavsdøgn)")

    failures = Failures(ig.MetaApiError)
    pending, saved, in_a_row = [], 0, 0
    for day in days(start, end):
        # api_get prøver selv på nytt ved forbigående feil; feiler døgnet likevel, hoppes det over.
        rows = failures.soft(f"Instagram-døgn {day}", lambda: ig_day(account_id, day))
        if rows is None:
            in_a_row += 1
            if in_a_row >= 5:
                raise ig.MetaApiError("Fem døgn på rad feilet. Avbryter.")
        else:
            pending += rows
            in_a_row = 0
        if len(pending) >= SAVE_EVERY * 4 or day == end:
            saved += save(pending, dry_run, ig.assert_no_token)
            pending = []
        if backfill:
            print(f"  {day}", end="\r", flush=True)
            time.sleep(0.2)
    print(f"Instagram: {saved} rader {'(ikke lagret, --dry-run)' if dry_run else 'lagret'}"
          f"{f', {len(failures.failed)} døgn feilet' if failures.failed else ''}.")
    return failures.problems(saved_anything=saved > 0)


# --- YouTube ------------------------------------------------------------------

def run_youtube(backfill, dry_run):
    yt = yt_mod.YouTube()
    channel = yt_mod.fetch_channel(yt)
    account_id = None if dry_run else db.get_account("youtube", channel["id"])["id"]
    end = pacific_today()                              # Analytics gir bare døgn den har tall for
    start = YT_BACKFILL_START if backfill else end - timedelta(days=RECENT_DAYS)
    print(f"YouTube: henter {start} → {end} (Stillehavsdøgn, Analytics ligger 2–3 døgn etter)")

    params = {"startDate": start.isoformat(), "endDate": end.isoformat(), "metrics": ",".join(YT_METRICS)}
    failures = Failures(yt_mod.YouTubeApiError)
    by_type = failures.soft("YouTube per døgn og format",
                            lambda: yt.analytics(**params, dimensions="day,creatorContentType", sort="day"), [])
    totals = failures.soft("YouTube per døgn (hele kanalen)", lambda: yt.analytics(**params, dimensions="day", sort="day"), [])

    grouped = defaultdict(lambda: (defaultdict(int), {}))  # (dag, format) → (summer, raw)
    for r in by_type:
        sums, raw = grouped[(r["day"], YT_FORMATS.get(r["creatorContentType"], "OTHER"))]
        for k in YT_METRICS:
            sums[k] += r.get(k) or 0
        raw[r["creatorContentType"]] = {k: r.get(k) for k in YT_METRICS}
    for r in totals:
        grouped[(r["day"], "ALL")] = ({k: r.get(k) or 0 for k in YT_METRICS}, {"ALL": {k: r.get(k) for k in YT_METRICS}})

    rows = [row(account_id, date.fromisoformat(day), fmt, sums,
                sums.get("likes", 0) + sums.get("comments", 0) + sums.get("shares", 0), raw, saves=False)
            for (day, fmt), (sums, raw) in sorted(grouped.items())]
    saved = save(rows, dry_run, yt.assert_clean)
    through = max((r["activity_date"] for r in rows), default="ingen")
    print(f"YouTube: {saved} rader {'(ikke lagret, --dry-run)' if dry_run else 'lagret'}, tall til og med {through}.")
    return failures.problems(saved_anything=saved > 0)


# --- TikTok -------------------------------------------------------------------

def utc_today():
    return datetime.now(timezone.utc).date()


def tt_day_ready(m):
    """TikTok gir nuller (også følgertotal 0) for døgn som ikke er ferdig behandlet (sett 13.10.2026 for
    døgnet før). Følgertotalen er aldri 0 for en konto med følgere, så 0/mangler betyr «ikke klart»."""
    values = [m.get(k) for k in ("video_views", "likes", "comments", "shares")]
    return all(v is not None for v in values) and bool(m.get("followers_count"))


def tt_rows(account_id, metrics):
    """account_daily-rader (format ALL) fra metrics i /business/get/. TikToks video_views heter views her."""
    rows = []
    for m in sorted(metrics, key=lambda x: x["date"]):
        values = {"views": m.get("video_views"), "likes": m.get("likes"),
                  "comments": m.get("comments"), "shares": m.get("shares")}
        if not tt_day_ready(m):
            continue                       # døgnet er ikke ferdig behandlet hos TikTok; hentes igjen neste kjøring
        raw = {"day_timezone": "UTC", **{k: v for k, v in m.items() if k != "audience_activity"}}
        rows.append(row(account_id, date.fromisoformat(m["date"]), "ALL", values,
                        values["likes"] + values["comments"] + values["shares"], raw, saves=False))
    return rows


def tt_follower_rows(account_id, metrics, advanced):
    """account_insights per UTC-døgn: følgertotal, og nye følgere bare når kontoen har tilgang (ellers null)."""
    return [{
        "account_id": account_id, "snapshot_date": m["date"],
        "followers_count": m.get("followers_count"),
        "new_followers": m.get("daily_new_followers") if advanced else None,
    } for m in metrics if tt_day_ready(m)]


def run_tiktok(backfill, dry_run):
    problems = []
    for account in tt_mod.tiktok_accounts():
        tt = tt_mod.TikTok(account["id"], dry_run=dry_run)
        profile = tt.profile(["is_business_account", "has_advanced_access"])
        extra, _ = tt_mod.business_fields(profile)
        advanced = bool(extra)
        end = utc_today() - timedelta(days=1)
        start = utc_today() - timedelta(days=TT_HISTORY_DAYS) if backfill else end - timedelta(days=RECENT_DAYS - 1)
        print(f"TikTok konto {account['id']}: henter {start} → {end} (UTC-døgn, 24–48 t forsinkelse)")
        fields = tt_mod.DAILY_FIELDS + extra
        metrics = tt.profile(fields, start=start, end=end).get("metrics") or []
        tt_mod.print_field_report("TikTok per døgn", metrics, ["date"] + fields)
        if not advanced:
            print("  (daglige nye/tapte følgere, unike visninger og engasjert publikum krever "
                  "Business/Advanced Access: ikke hentet, lagres som null)")

        rows = tt_rows(account["id"], metrics)
        saved = save(rows, dry_run, tt.assert_clean)
        followers = tt_follower_rows(account["id"], metrics, advanced)
        if followers and not dry_run:
            tt.assert_clean(followers)
            # Nye døgn får egen rad; eksisterende rader får bare følgertallene oppdatert.
            db.upsert("account_insights", [{**f, "raw": {"source": "tiktok_business_get_daily", "day_timezone": "UTC"}}
                                           for f in followers],
                      on_conflict="account_id,snapshot_date", ignore_duplicates=True)
            db.upsert("account_insights", followers, on_conflict="account_id,snapshot_date")
        through = max((r["activity_date"] for r in rows), default="ingen")
        print(f"TikTok: {saved} døgn {'(ikke lagret, --dry-run)' if dry_run else 'lagret'}, "
              f"{len(followers)} døgn med følgertall, tall til og med {through}.")
        if saved == 0:
            problems.append(f"konto {account['id']}: ingen døgn med tall")
    return problems


# --- Felles -------------------------------------------------------------------

def save(rows, dry_run, check):
    if not rows:
        return 0
    check(rows)   # sikring: ingen tokens i det som lagres
    if not dry_run:
        db.upsert("account_daily", rows, on_conflict="account_id,activity_date,format")
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Hent daglig aktivitet per konto og format til Supabase.")
    parser.add_argument("--backfill", action="store_true",
                        help="Instagram så langt tilbake som Meta tillater (2 år), YouTube fra 04.06.2026, TikTok 60 døgn")
    parser.add_argument("--only", choices=["instagram", "youtube", "tiktok"], help="Bare én plattform")
    parser.add_argument("--dry-run", action="store_true",
                        help="Hent fra API-ene og vis antall, uten å skrive data til Supabase "
                             "(TikTok leser tilgangen fra Supabase)")
    args = parser.parse_args()

    problems = []
    runners = {"instagram": (run_instagram, ig.MetaApiError), "youtube": (run_youtube, yt_mod.YouTubeApiError),
               "tiktok": (run_tiktok, tt_mod.TikTokApiError)}
    for platform, (run, api_error) in runners.items():
        if args.only and args.only != platform:
            continue
        try:   # en feil på én plattform stopper ikke den andre
            problems += [f"{platform}: {p}" for p in run(args.backfill, args.dry_run)]
        except (api_error, db.SupabaseError) as e:
            problems.append(f"{platform}: {type(e).__name__}: {e}")
    if problems:
        # Rød kjøring bare ved mer enn et fåtall feilede kall, eller når ingenting ble lagret.
        sys.exit("Kjøringen regnes som feilet: " + "; ".join(problems))


if __name__ == "__main__":
    main()
