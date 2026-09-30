"""
NM Insights - setter YouTube-hemmelighetene som GitHub Secrets direkte fra filene.

Verdiene leses fra secrets/youtube_client_secret.json og secrets/youtube_token.json
og sendes til `gh secret set` via standard input, så de aldri vises i terminalen,
i kommandolinjen eller i shell-historikken.

Krever GitHub CLI (gh) installert og innlogget: `gh auth login`.

Kjør:  python youtube_secrets_to_github.py
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = "AdrianNordbo/NM-insights"
CLIENT_FILE = Path("secrets/youtube_client_secret.json")
TOKEN_FILE = Path("secrets/youtube_token.json")


def main():
    if not shutil.which("gh"):
        sys.exit("Finner ikke gh. Installer med `winget install GitHub.cli` og logg inn med `gh auth login`.")
    for path in (CLIENT_FILE, TOKEN_FILE):
        if not path.exists():
            sys.exit(f"Finner ikke {path}. Kjør youtube_auth.py først.")

    client = json.loads(CLIENT_FILE.read_text(encoding="utf-8"))["installed"]
    token = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    secrets = {
        "YOUTUBE_CLIENT_ID": client["client_id"],
        "YOUTUBE_CLIENT_SECRET": client["client_secret"],
        "YOUTUBE_REFRESH_TOKEN": token["refresh_token"],
    }
    for name, value in secrets.items():
        result = subprocess.run(
            ["gh", "secret", "set", name, "--repo", REPO],
            input=value, text=True, capture_output=True,
        )
        if result.returncode != 0:
            sys.exit(f"Kunne ikke sette {name}: {result.stderr.strip()}")
        print(f"Satt {name}")


if __name__ == "__main__":
    main()
