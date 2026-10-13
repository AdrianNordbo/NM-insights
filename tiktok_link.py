"""
NM Insights - lager en engangslenke for å koble en TikTok-konto.

    .venv/Scripts/python tiktok_link.py [--account-id 3]

Lenken er autoriseringslenken fra TikTok-portalen (TIKTOK_AUTH_URL i .env) med en tilfeldig state og
disable_auto_auth=1 (samtykkesiden vises alltid, så alle scopes blir gitt). Bare SHA-256-hashen av
staten lagres i tiktok_oauth_states. Lenken virker én gang og i 30 minutter, og må åpnes i en nettleser
der du er innlogget i dashboardet.

Sjekker at redirect_uri i portallenken er den samme som TIKTOK_REDIRECT_URI, så en gammel lenke
(f.eks. til www.nordbomarketing.no) stoppes her.
"""
import argparse
import hashlib
import os
import secrets
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

import db

load_dotenv()

DEFAULT_REDIRECT = "https://insights.nordbomarketing.no/tiktok/callback/"


def state_hash(state):
    return hashlib.sha256(state.encode("utf-8")).hexdigest()


def build_link(auth_url, state, redirect_uri):
    """Portallenken med state og disable_auto_auth=1. Stopper hvis lenken ikke passer."""
    parts = urlsplit(auth_url)
    if parts.scheme != "https" or not (parts.hostname or "").endswith("tiktok.com"):
        raise ValueError("TIKTOK_AUTH_URL er ikke en https-lenke til tiktok.com.")
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if k not in ("state", "disable_auto_auth")]
    found = dict(query).get("redirect_uri")
    if found != redirect_uri:
        raise ValueError(
            f"redirect_uri i TIKTOK_AUTH_URL er {found!r}, ventet {redirect_uri!r}. "
            "Aktiver den nye redirect-adressen i portalen og kopier den nye lenken.")
    query += [("state", state), ("disable_auto_auth", "1")]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def tiktok_account_id():
    rows = db.select("accounts", {"select": "id,client_name", "platform": "eq.tiktok", "order": "id"})
    if len(rows) != 1:
        raise SystemExit(f"Fant {len(rows)} TikTok-kontoer. Angi --account-id.")
    return rows[0]["id"]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--account-id", type=int, help="accounts.id for TikTok-kontoen (standard: den eneste)")
    args = parser.parse_args()

    auth_url = os.getenv("TIKTOK_AUTH_URL")
    if not auth_url:
        raise SystemExit("Mangler TIKTOK_AUTH_URL i .env (autoriseringslenken fra TikTok-portalen).")
    redirect_uri = os.getenv("TIKTOK_REDIRECT_URI") or DEFAULT_REDIRECT

    account_id = args.account_id or tiktok_account_id()
    state = secrets.token_urlsafe(32)
    try:
        link = build_link(auth_url, state, redirect_uri)
    except ValueError as e:
        raise SystemExit(str(e))

    db.upsert("tiktok_oauth_states", [{"state_hash": state_hash(state), "account_id": account_id}],
              on_conflict="state_hash")
    print(f"Engangslenke for konto {account_id} (gyldig i 30 minutter, kan brukes én gang).")
    print("Åpne den i en nettleser der du er innlogget i dashboardet:\n")
    print(link)


if __name__ == "__main__":
    main()
