"""
NM Insights - lager nøkkelparet for TikTok-tokenet og skriver det rett til .env.

    .venv/Scripts/python tiktok_keys.py

Skriver TIKTOK_TOKEN_PRIVATE_KEY og TIKTOK_TOKEN_PUBLIC_KEY til .env. Verdiene skrives aldri ut.
Stopper hvis nøklene finnes fra før: et nytt par gjør lagrede tokens uleselige, og kontoen må da
kobles på nytt (bruk --erstatt bare da).

Etterpå (Adrian, manuelt):
  - Vercel (Production): TIKTOK_TOKEN_PUBLIC_KEY
  - GitHub Secrets:      TIKTOK_TOKEN_PRIVATE_KEY
"""
import argparse
from pathlib import Path

from dotenv import dotenv_values

from tiktok_crypto import decrypt, encrypt, generate_keypair

ENV = Path(__file__).with_name(".env")
NAMES = ("TIKTOK_TOKEN_PRIVATE_KEY", "TIKTOK_TOKEN_PUBLIC_KEY")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--erstatt", action="store_true", help="lag nytt par selv om det finnes (krever ny kobling)")
    args = parser.parse_args()

    existing = dotenv_values(ENV) if ENV.exists() else {}
    if any(existing.get(n) for n in NAMES) and not args.erstatt:
        raise SystemExit("Nøklene finnes allerede i .env. Ingenting er endret. (--erstatt lager nytt par.)")

    private, public = generate_keypair()
    assert decrypt(private, encrypt(public, "rft.selvtest")) == "rft.selvtest"

    lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
    lines = [l for l in lines if l.split("=", 1)[0].strip() not in NAMES]
    lines += [f"TIKTOK_TOKEN_PRIVATE_KEY={private}", f"TIKTOK_TOKEN_PUBLIC_KEY={public}"]
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Nøkkelparet er skrevet til .env (TIKTOK_TOKEN_PRIVATE_KEY og TIKTOK_TOKEN_PUBLIC_KEY).")
    print("Legg TIKTOK_TOKEN_PUBLIC_KEY i Vercel og TIKTOK_TOKEN_PRIVATE_KEY i GitHub Secrets.")


if __name__ == "__main__":
    main()
