"""
NM Insights - tynn klient mot Supabase REST (PostgREST).

Nøkkelen sendes bare i apikey-headeren, aldri i URL, print eller logg.
"""
import os

import requests
from dotenv import load_dotenv

load_dotenv()

URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
KEY = os.getenv("SUPABASE_SECRET_KEY")
CHUNK_SIZE = 500   # rader per upsert-kall
PAGE_SIZE = 1000   # PostgREST sin standard maksgrense per svar


class SupabaseError(RuntimeError):
    pass


def _headers(prefer=None):
    if not URL or not KEY:
        raise SupabaseError("Mangler SUPABASE_URL eller SUPABASE_SECRET_KEY i .env-filen.")
    headers = {"apikey": KEY, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _check(resp):
    if resp.status_code >= 400:
        raise SupabaseError(f"Supabase svarte {resp.status_code}: {resp.text[:500]}")


def select(table, params):
    """Henter alle rader som matcher PostgREST-filtrene i params, side for side.
    Ta med "order" i params for stabil sidedeling."""
    rows, offset = [], 0
    while True:
        resp = requests.get(
            f"{URL}/rest/v1/{table}",
            params={**params, "limit": PAGE_SIZE, "offset": offset},
            headers=_headers(),
            timeout=60,
        )
        _check(resp)
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def upsert(table, rows, on_conflict, ignore_duplicates=False, returning=None):
    """Upsert i biter. Alle rader må ha de samme nøklene.

    ignore_duplicates=True lar eksisterende rader stå urørt.
    returning="id,kolonne" returnerer de lagrede radene med disse kolonnene."""
    resolution = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
    prefer = f"resolution={resolution},return={'representation' if returning else 'minimal'}"
    params = {"on_conflict": on_conflict}
    if returning:
        params["select"] = returning

    saved = []
    for i in range(0, len(rows), CHUNK_SIZE):
        resp = requests.post(
            f"{URL}/rest/v1/{table}",
            params=params,
            json=rows[i:i + CHUNK_SIZE],
            headers=_headers(prefer),
            timeout=60,
        )
        _check(resp)
        if returning:
            saved.extend(resp.json())
    return saved


def get_account(platform, platform_account_id):
    rows = select("accounts", {
        "select": "*",
        "platform": f"eq.{platform}",
        "platform_account_id": f"eq.{platform_account_id}",
    })
    if not rows:
        raise SupabaseError(
            f"Fant ingen konto for {platform} {platform_account_id} i accounts-tabellen."
        )
    return rows[0]
