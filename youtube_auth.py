"""
NM Insights - engangsinnlogging mot YouTube (OAuth, kun lesetilgang).

Kjøres lokalt én gang av kanaleieren. Åpner nettleseren, lagrer tokenet i
secrets/youtube_token.json, skriver YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET og
YOUTUBE_REFRESH_TOKEN inn i .env, og gjør ett testkall mot kanalen.

Hemmeligheter (client secret, access token, refresh token) skrives aldri ut.

Kjør:  python youtube_auth.py
"""
import json
import sys
from pathlib import Path

import requests
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
SECRETS_DIR = Path("secrets")
CLIENT_FILE = SECRETS_DIR / "youtube_client_secret.json"
TOKEN_FILE = SECRETS_DIR / "youtube_token.json"
ENV_FILE = Path(".env")
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"


def login():
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_FILE), scopes=SCOPES)
    return flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
        open_browser=True,
        # Standardmeldingen skriver ut hele innloggings-URL-en; den trengs ikke
        authorization_prompt_message="Nettleseren åpnes for innlogging med kanalkontoen ...",
        success_message="Innlogging fullført. Du kan lukke denne fanen og gå tilbake til terminalen.",
    )


def check_credentials(creds):
    if not creds.refresh_token:
        sys.exit("Fikk ingen refresh token fra Google. Kjør på nytt (prompt=consent skal gi en ny).")
    granted = set(creds.granted_scopes or creds.scopes or [])
    if granted != set(SCOPES):
        sys.exit(f"Uventede tilganger: {sorted(granted)}. Forventet bare {SCOPES}.")


def save_token(creds):
    SECRETS_DIR.mkdir(exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")


def update_env(values):
    """Oppdaterer eller legger til nøkler i .env uten å røre andre linjer."""
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    remaining = dict(values)
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key in remaining:
            out.append(f"{key}={remaining.pop(key)}")
        else:
            out.append(line)
    if remaining:
        if out and out[-1].strip():
            out.append("")
        out.extend(f"{k}={v}" for k, v in remaining.items())
    ENV_FILE.write_text("\n".join(out) + "\n", encoding="utf-8")
    return list(values)


def channel_info(creds):
    resp = requests.get(
        CHANNELS_URL,
        params={"part": "snippet,statistics", "mine": "true"},
        headers={"Authorization": f"Bearer {creds.token}"},
        timeout=30,
    )
    data = resp.json()
    if "error" in data:
        sys.exit(f"Feil fra YouTube: {data['error'].get('message', 'ukjent feil')}")
    return data.get("items", [])


def main():
    if not CLIENT_FILE.exists():
        sys.exit(f"Finner ikke {CLIENT_FILE}")

    creds = login()
    check_credentials(creds)
    save_token(creds)
    print(f"Token lagret i {TOKEN_FILE}")

    client = json.loads(CLIENT_FILE.read_text(encoding="utf-8"))["installed"]
    written = update_env({
        "YOUTUBE_CLIENT_ID": client["client_id"],
        "YOUTUBE_CLIENT_SECRET": client["client_secret"],
        "YOUTUBE_REFRESH_TOKEN": creds.refresh_token,
    })
    print(f"Skrev {', '.join(written)} til {ENV_FILE}")

    channels = channel_info(creds)
    if not channels:
        sys.exit("Kontoen har ingen YouTube-kanal. Valgte du riktig konto/merkevarekonto?")
    for ch in channels:
        print("\nInnlogget kanal:")
        print(f"  Navn:   {ch['snippet']['title']}")
        print(f"  ID:     {ch['id']}")
        print(f"  Videoer: {ch['statistics'].get('videoCount', 'ukjent')}")


if __name__ == "__main__":
    main()
