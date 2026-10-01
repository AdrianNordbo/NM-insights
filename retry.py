"""
NM Insights - felles retry og feilhåndtering for API-kallene (Meta, YouTube Data API og Analytics).

retry():  prøver et kall på nytt etter 2, 5 og 10 sekunder, men bare når feilen er forbigående
          (nettverksfeil, HTTP 5xx, 429, Metas is_transient). En varig feil (f.eks. en ugyldig
          metric hos Meta) kastes med en gang, så fallback-logikken i skriptene virker som før.
Failures: lar et enkelt kall feile etter at retry er brukt opp: feilen logges tydelig og kjøringen
          går videre. Til slutt avgjør finish() om kjøringen skal bli rød: bare når mer enn
          MAX_FAILED_CALLS kall har feilet, eller når ingenting ble lagret.

Meldingene inneholder aldri tokens: feilmeldingene kommer fra API-svarenes «message»-felt.
"""
import sys
import time

DELAYS = (2, 5, 10)        # sekunder mellom forsøkene (3 nye forsøk etter det første)
MAX_FAILED_CALLS = 3       # flere enn dette gir rød kjøring


def _sleep(seconds):
    time.sleep(seconds)  # egen funksjon, så testene kan erstatte ventingen uten å påvirke annen bruk av time


def retry(fn, *, what, is_transient, delays=DELAYS, sleep=None, log=print):
    """Kaller fn(). Ved forbigående feil: vent og prøv igjen, opptil len(delays) ganger."""
    for attempt in range(len(delays) + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - is_transient avgjør hva som prøves på nytt
            if attempt == len(delays) or not is_transient(e):
                raise
            log(f"  {what}: {e} (forbigående) - prøver igjen om {delays[attempt]} s "
                f"(forsøk {attempt + 2} av {len(delays) + 1})", flush=True)
            (sleep or _sleep)(delays[attempt])


class Failures:
    """Samler kall som feilet etter retry, og avgjør til slutt om kjøringen er feilet."""

    def __init__(self, errors, limit=MAX_FAILED_CALLS, log=print):
        self.errors = errors      # unntakstyper som kan hoppes over (API-feil), ikke programfeil
        self.limit = limit
        self.log = log
        self.failed = []          # (hva, melding)

    def soft(self, what, fn, default=None):
        """Kjører fn(). Feiler kallet (etter retry), logges det og default returneres."""
        try:
            return fn()
        except self.errors as e:
            self.failed.append((what, str(e)))
            self.log(f"FEIL (hopper over): {what}: {e}", flush=True)
            return default

    def problems(self, saved_anything):
        """Grunner til at kjøringen skal regnes som feilet (tom liste = ok)."""
        out = []
        if len(self.failed) > self.limit:
            out.append(f"{len(self.failed)} kall feilet (grensen er {self.limit})")
        if not saved_anything:
            out.append("ingenting ble lagret")
        return out

    def finish(self, saved_anything, name):
        """Skriver oppsummering og avslutter med feilkode hvis kjøringen skal bli rød."""
        if self.failed:
            self.log(f"{name}: {len(self.failed)} kall feilet og ble hoppet over:")
            for what, message in self.failed:
                self.log(f"  - {what}: {message}")
        problems = self.problems(saved_anything)
        if problems:
            sys.exit(f"{name}: kjøringen regnes som feilet: {'; '.join(problems)}.")
