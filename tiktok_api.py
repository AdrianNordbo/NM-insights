"""
NM Insights - felles klient for TikTok Accounts API v1.3 (fetch_tiktok.py og fetch_daily.py --only tiktok).

Tilgang:
  - Refresh-tokenet ligger kryptert i public.tiktok_tokens (lagret av /tiktok/callback). Det dekrypteres med
    TIKTOK_TOKEN_PRIVATE_KEY og fornyes til et access-token (gyldig 1 døgn) ved hver kjøring.
  - Gir TikTok et nytt refresh-token, krypteres det på nytt og lagres (også ved --dry-run, ellers kan
    tilgangen gå tapt). last_refresh_at og refresh_expires_at oppdateres ved hver vellykkede fornyelse.
  - Access-tokenet lagres aldri. Tokens og client secret skrives aldri ut, og assert_clean() stopper
    lagring av noe som inneholder dem.

Kontotype: Felt som bare finnes for Business-kontoer eller Advanced Access, hentes bare når kontoen har
det. Ellers lagres de som null (ikke 0), se business_fields().
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

import db
from retry import retry
from tiktok_crypto import decrypt, encrypt, public_from_private

load_dotenv()

BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"
REFRESH_URL = f"{BASE_URL}/tt_user/oauth2/refresh_token/"
WARN_BEFORE_EXPIRY = timedelta(days=30)

# Overbelastning (40100) og alle TikToks serverfeil (5xxxx, f.eks. 51010 «Internal Time out», sett
# 13.10.2026) prøves på nytt. HTTP-status er ofte 200 også ved feil, så koden i svaret avgjør.
TRANSIENT_CODES = {40100}


def is_transient_code(code):
    return code in TRANSIENT_CODES or (isinstance(code, int) and code >= 50000)

# Kontonivå (/business/get/)
PROFILE_FIELDS = ["username", "display_name", "followers_count", "following_count", "videos_count",
                  "total_likes", "is_business_account", "has_advanced_access"]
DAILY_FIELDS = ["video_views", "likes", "comments", "shares", "profile_views", "followers_count"]
# Bare TikTok Accounts with Advanced Access eller Verified Business Accounts
DAILY_ADVANCED_FIELDS = ["unique_video_views", "daily_total_followers", "daily_new_followers",
                         "daily_lost_followers", "engaged_audience"]

# Per innlegg (/business/video/list/)
VIDEO_FIELDS = ["item_id", "create_time", "caption", "media_type", "is_ad", "share_url", "video_duration",
                "video_views", "likes", "comments", "shares", "favorites", "reach",
                "total_time_watched", "average_time_watched", "full_video_watched_rate", "new_followers"]
# Bare Business-kontoer
VIDEO_BUSINESS_FIELDS = ["profile_views"]


class TikTokApiError(RuntimeError):
    """transient = forbigående (nettverk, HTTP 5xx/429, TikToks overbelastningskoder)."""

    def __init__(self, message, code=None, transient=False):
        super().__init__(message)
        self.code = code
        self.transient = transient


def is_transient(error):
    return getattr(error, "transient", False)


def business_fields(profile):
    """(ekstra dagsfelt, ekstra videofelt) kontoen har tilgang til."""
    advanced = bool(profile.get("is_business_account") or profile.get("has_advanced_access"))
    business = bool(profile.get("is_business_account"))
    return (DAILY_ADVANCED_FIELDS if advanced else []), (VIDEO_BUSINESS_FIELDS if business else [])


def _parse(resp, what):
    try:
        body = resp.json()
    except ValueError:
        status = resp.status_code
        raise TikTokApiError(f"{what}: ugyldig svar fra TikTok (HTTP {status})",
                             transient=status >= 500 or status == 429) from None
    code = body.get("code")
    if resp.status_code >= 400 or code != 0:
        status = resp.status_code
        transient = status >= 500 or status == 429 or is_transient_code(code)
        raise TikTokApiError(f"{what}: TikTok svarte {code if code is not None else status}: "
                             f"{str(body.get('message') or 'ukjent feil')[:200]}", code, transient)
    return body.get("data") or {}


class TikTok:
    def __init__(self, account_id, dry_run=False):
        missing = [k for k in ("TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET", "TIKTOK_TOKEN_PRIVATE_KEY")
                   if not os.getenv(k)]
        if missing:
            sys.exit(f"Mangler {', '.join(missing)} i miljøet (.env eller GitHub Secrets).")
        self.account_id = account_id
        self.dry_run = dry_run
        self._client_secret = os.environ["TIKTOK_CLIENT_SECRET"]
        self._private_key = os.environ["TIKTOK_TOKEN_PRIVATE_KEY"]
        rows = db.select("tiktok_tokens", {"select": "open_id,status,refresh_token_enc,refresh_expires_at",
                                           "account_id": f"eq.{account_id}"})
        if not rows:
            sys.exit(f"Konto {account_id} er ikke koblet til TikTok. Kjør tiktok_link.py.")
        row = rows[0]
        if row["status"] != "ok":
            sys.exit(f"TikTok-koblingen for konto {account_id} har status {row['status']}. Koble på nytt.")
        self.open_id = row["open_id"]
        try:
            self._refresh_token = decrypt(self._private_key, row["refresh_token_enc"])
        except Exception:  # noqa: BLE001 - meldingen kan ikke inneholde tokenet, men vi viser bare typen
            sys.exit("Kunne ikke dekryptere TikTok-tokenet. Er TIKTOK_TOKEN_PRIVATE_KEY riktig nøkkel?")
        self._access_token = None
        self._refresh()

    # --- Tilgang ----------------------------------------------------------------

    def _refresh(self):
        def call():
            try:
                resp = requests.post(REFRESH_URL, timeout=30, json={
                    "client_id": os.environ["TIKTOK_CLIENT_ID"],
                    "client_secret": self._client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                })
            except requests.RequestException as e:
                raise TikTokApiError(f"fornyelse av tilgang: nettverksfeil ({type(e).__name__})",
                                     transient=True) from None
            return _parse(resp, "fornyelse av tilgang")

        try:
            data = retry(call, what="TikTok fornyelse", is_transient=is_transient)
        except TikTokApiError as e:
            self._update_token_row({"last_error": str(e)[:500]})
            raise
        if not data.get("access_token"):
            raise TikTokApiError("fornyelse av tilgang: svaret mangler access-token")
        self._access_token = data["access_token"]
        now = datetime.now(timezone.utc)
        update = {"last_refresh_at": now.isoformat(), "last_error": None, "updated_at": now.isoformat()}
        if data.get("refresh_token_expires_in"):
            expires = now + timedelta(seconds=int(data["refresh_token_expires_in"]))
            update["refresh_expires_at"] = expires.isoformat()
            if expires - now < WARN_BEFORE_EXPIRY:
                print(f"ADVARSEL: TikTok-tilgangen utløper {expires:%d.%m.%Y}. Koble på nytt med tiktok_link.py.")
        new_refresh = data.get("refresh_token")
        rotated = bool(new_refresh) and new_refresh != self._refresh_token
        if rotated:
            self._refresh_token = new_refresh
            update["refresh_token_enc"] = encrypt(public_from_private(self._private_key), new_refresh)
        # Nytt refresh-token lagres alltid (også ved --dry-run); ellers bare tidsstemplene utenom dry-run.
        if rotated or not self.dry_run:
            self._update_token_row(update if not self.dry_run else
                                   {k: update[k] for k in ("refresh_token_enc", "refresh_expires_at", "updated_at")
                                    if k in update})
        self.rotated = rotated

    def _update_token_row(self, values):
        resp = requests.patch(f"{db.URL}/rest/v1/tiktok_tokens", params={"account_id": f"eq.{self.account_id}"},
                              json=values, headers=db._headers("return=minimal"), timeout=30)
        db._check(resp)

    # --- Kall -------------------------------------------------------------------

    def get(self, path, params, what):
        query = {k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in params.items()}
        query["business_id"] = self.open_id

        def call():
            try:
                resp = requests.get(f"{BASE_URL}/{path}", params=query, timeout=60,
                                    headers={"Access-Token": self._access_token})
            except requests.RequestException as e:  # meldingen kan inneholde URL, så bare typen vises
                raise TikTokApiError(f"{what}: nettverksfeil ({type(e).__name__})", transient=True) from None
            return _parse(resp, what)

        return retry(call, what=what, is_transient=is_transient)

    def profile(self, fields=PROFILE_FIELDS, start=None, end=None):
        params = {"fields": fields}
        if start:
            params["start_date"] = start.isoformat()
        if end:
            params["end_date"] = end.isoformat()
        return self.get("business/get/", params, what="TikTok /business/get/")

    def videos(self, fields):
        """Alle innlegg, side for side (maks 20 per side)."""
        out, cursor, seen = [], None, set()
        while True:
            params = {"fields": fields, "max_count": 20}
            if cursor is not None:
                params["cursor"] = cursor
            data = self.get("business/video/list/", params, what="TikTok /business/video/list/")
            for v in data.get("videos") or []:
                if v.get("item_id") not in seen:
                    seen.add(v.get("item_id"))
                    out.append(v)
            if not data.get("has_more") or data.get("cursor") in (None, cursor):
                return out
            cursor = data["cursor"]

    def assert_clean(self, obj):
        """Sikring: ingenting som lagres, skal inneholde tokens eller client secret."""
        text = json.dumps(obj, default=str)
        for secret in (self._access_token, self._refresh_token, self._client_secret):
            if secret and secret in text:
                raise RuntimeError("Data til lagring inneholder en hemmelighet. Avbryter.")


def tiktok_accounts():
    """TikTok-kontoer med en koblet tilgang (status ok)."""
    tokens = {r["account_id"] for r in db.select("tiktok_tokens", {"select": "account_id", "status": "eq.ok"})}
    rows = db.select("accounts", {"select": "*", "platform": "eq.tiktok", "active": "is.true", "order": "id"})
    return [a for a in rows if a["id"] in tokens]


def field_report(items, fields):
    """{felt: (antall med verdi, antall null, antall mangler)} for å vise hva TikTok faktisk ga."""
    report = {}
    for f in fields:
        present = sum(1 for i in items if f in i and i[f] is not None)
        null = sum(1 for i in items if f in i and i[f] is None)
        report[f] = (present, null, len(items) - present - null)
    return report


def print_field_report(title, items, fields):
    print(f"\n{title} ({len(items)} rader): felt → med verdi / null / mangler i svaret")
    for f, (present, null, missing) in field_report(items, fields).items():
        flag = "" if present == len(items) else ("  <- tom" if present == 0 else "  <- delvis")
        print(f"  {f:28} {present:>4} / {null:>4} / {missing:>4}{flag}")
