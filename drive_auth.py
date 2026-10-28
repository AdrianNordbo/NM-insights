"""
NM Insights - engangsinnlogging mot Google Drive (OAuth, bare metadata: mappe- og filnavn).

Kjøres lokalt én gang av Adrian med kontoen som Veksthuset-mappen er delt med. Bruker samme OAuth-klient
(Desktop) i Google Cloud-prosjektet «NM Insights» som YouTube. Åpner nettleseren, lagrer tokenet i
secrets/drive_token.json, skriver DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET og DRIVE_REFRESH_TOKEN inn i .env,
og gjør et testkall (hvilken konto, og om DRIVE_VEKSTHUSET_FOLDER_ID kan leses).

Scope: drive.metadata.readonly. Gir navn og egenskaper til filer, ikke innholdet; ingen nedlasting.
Hemmeligheter (client secret, access token, refresh token) skrives aldri ut.

Kjør:  python drive_auth.py
"""
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

from youtube_auth import update_env

SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"]
SECRETS_DIR = Path("secrets")
CLIENT_FILE = SECRETS_DIR / "youtube_client_secret.json"  # samme OAuth-klient i prosjektet NM Insights
TOKEN_FILE = SECRETS_DIR / "drive_token.json"
ENV_FILE = Path(".env")
DRIVE_URL = "https://www.googleapis.com/drive/v3"


def login():
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_FILE), scopes=SCOPES)
    return flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
        open_browser=True,
        authorization_prompt_message="Nettleseren åpnes for innlogging med kontoen som Veksthuset-mappen er delt med ...",
        success_message="Innlogging fullført. Du kan lukke denne fanen og gå tilbake til terminalen.",
    )


def check_credentials(creds):
    if not creds.refresh_token:
        sys.exit("Fikk ingen refresh token fra Google. Kjør på nytt (prompt=consent skal gi en ny).")
    granted = set(creds.granted_scopes or creds.scopes or [])
    if granted != set(SCOPES):
        sys.exit(f"Uventede tilganger: {sorted(granted)}. Forventet bare {SCOPES}.")


def get(creds, path, params):
    resp = requests.get(f"{DRIVE_URL}/{path}", params=params, timeout=30,
                        headers={"Authorization": f"Bearer {creds.token}"})
    data = resp.json()
    if "error" in data:
        return None, f"{data['error'].get('message', 'ukjent feil')} (HTTP {resp.status_code})"
    return data, None


def main():
    if not CLIENT_FILE.exists():
        sys.exit(f"Finner ikke {CLIENT_FILE}")

    creds = login()
    check_credentials(creds)
    SECRETS_DIR.mkdir(exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Token lagret i {TOKEN_FILE}")

    client = json.loads(CLIENT_FILE.read_text(encoding="utf-8"))["installed"]
    written = update_env({
        "DRIVE_CLIENT_ID": client["client_id"],
        "DRIVE_CLIENT_SECRET": client["client_secret"],
        "DRIVE_REFRESH_TOKEN": creds.refresh_token,
    })
    print(f"Skrev {', '.join(written)} til {ENV_FILE}")

    about, feil = get(creds, "about", {"fields": "user(displayName,emailAddress)"})
    if feil:
        sys.exit(f"Testkallet feilet: {feil}")
    print(f"\nInnlogget som: {about['user'].get('displayName')} ({about['user'].get('emailAddress')})")

    load_dotenv(ENV_FILE)
    folder = os.getenv("DRIVE_VEKSTHUSET_FOLDER_ID")
    if not folder:
        print("DRIVE_VEKSTHUSET_FOLDER_ID står ikke i .env ennå. Legg den inn og kjør fetch_drive.py --dry-run.")
        return
    meta, feil = get(creds, f"files/{folder}", {
        "fields": "name,mimeType,capabilities(canListChildren)", "supportsAllDrives": "true"})
    if feil:
        sys.exit(f"Fant ikke mappen i DRIVE_VEKSTHUSET_FOLDER_ID: {feil}")
    kan_liste = (meta.get("capabilities") or {}).get("canListChildren")
    print(f"Mappen: {meta['name']} ({'kan listes' if kan_liste else 'kan IKKE listes'})")


if __name__ == "__main__":
    main()
