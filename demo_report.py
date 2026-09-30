"""
NM Insights - demo-versjon av månedsrapporten med en planlagt TikTok-seksjon.

Brukes til skjermopptak i API-søknaden hos TikTok. Instagram-delen er den
vanlige rapporten med ekte tall, men anonymisert: kundenavnet er byttet ut og
captions og lenker til innlegg er skjult. TikTok-seksjonen viser hvordan
TikTok-tall skal presenteres, med EKSEMPELTALL som er tydelig merket på hvert
element, og bare med felt som finnes i /business/get/ og /business/video/list/.

Den vanlige rapporten (report.py) endres ikke.

Kjør:  python demo_report.py --måned 2026-09
Skriver data/rapport_maaned_<ÅÅÅÅ-MM>_demo_tiktok.html
"""
import argparse
import re
import sys
from datetime import datetime, timedelta

import db
from analyze import DATA_DIR, OSLO
from report import (
    MONTHS_NO, change, change_cell, esc, hbar_chart, load_all, load_youtube, month_bounds, month_report,
    num, pct, prelim, render, stat_tile, table, tiktok_coming_section,
)

EXAMPLE_TAG = '<span class="example-tag">Eksempeltall</span>'
CLIENT_NAME = "Veksthuset"
CLIENT_ALIAS = "Client A (Norwegian savings bank)"
HIDDEN_POST = '<span class="muted">Innlegg (skjult i demo)</span>'

# Oppdiktede, avrundede tall. Ikke ekte data fra TikTok.
TIKTOK_EXAMPLE = {
    "videos": (13, 11),               # (denne måneden, forrige måned)
    "views": (48_200, 39_500),
    "eng_median": (0.048, 0.041),
    "new_followers": (96, 71),
    # konsept: (videoer, median visninger, median visninger forrige måned,
    #           median eng., median delinger)
    "concepts": [
        ("Folka Først", 6, 1_300, 1_450, 0.031, 4),
        ("Sitcom", 4, 2_400, 1_900, 0.062, 14),
        ("På Gata", 3, 5_100, None, 0.055, 22),
    ],
}

# Hvor hvert TikTok-tall kommer fra (TikTok API for Business v1.3, Accounts).
# Bare felt fra /business/get/ (scope user.insights) og /business/video/list/
# (scope video.list). Felt som krever video.insights, som seertid, er utelatt.
DATA_SOURCES = [
    ("Videoer publisert", "/business/video/list/", "item_id, create_time", "video.list"),
    ("Visninger", "/business/video/list/", "video_views", "video.list"),
    ("Engasjementsrate", "/business/video/list/",
     "(likes + comments + shares) / reach", "video.list"),
    ("Delinger", "/business/video/list/", "shares", "video.list"),
    ("Nye følgere", "/business/get/", "daily_new_followers (Business Account)", "user.insights"),
    ("Konsept", "/business/video/list/", "caption, merket av NM Insights", "video.list"),
]

DEMO_CSS = """
<style>
.demo-banner { background: #fff4d6; color: #5c4400; border: 1px solid #e9c46a;
  border-radius: 10px; padding: 12px 16px; margin: 16px 0; font-weight: 500; }
.tiktok { position: relative; border: 2px dashed #e9c46a; border-radius: 12px;
  padding: 4px 20px 20px; margin-top: 40px;
  background: repeating-linear-gradient(135deg, transparent 0 18px, rgba(233,196,106,0.08) 18px 36px); }
.tiktok h2 { border-top: 0; }
.example-tag { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; padding: 2px 7px; border-radius: 4px; margin-left: 6px;
  background: #e9c46a; color: #3d2d00; vertical-align: 1px; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .demo-banner { background: #2a2616; color: #f3d98b; border-color: #7a6424; }
}
:root[data-theme="dark"] .demo-banner { background: #2a2616; color: #f3d98b; border-color: #7a6424; }
</style>
"""


def tiktok_section(month_name, prev_name):
    t = TIKTOK_EXAMPLE
    out = ['<section class="tiktok">',
           f"<h2>TikTok (planlagt) {EXAMPLE_TAG}</h2>",
           '<p class="demo-banner">Planlagt integrasjon med TikTok. <b>Alle tall i denne seksjonen er '
           "eksempeltall</b> som viser hvordan TikTok-data skal presenteres i månedsrapporten. "
           "De er ikke hentet fra TikTok og beskriver ingen ekte konto.</p>"]

    def tile(label, cur, prev, fmt):
        return stat_tile(f"{label} {EXAMPLE_TAG}", fmt(cur), change_cell(change(cur, prev)))

    out.append(f"<h3>Nøkkeltall {EXAMPLE_TAG}</h3>")
    out.append('<div class="tiles">' + "".join([
        tile("Videoer publisert", *t["videos"], num),
        tile("Visninger", *t["views"], num),
        tile("Engasjementsrate (median)", *t["eng_median"], pct),
        tile("Nye følgere", *t["new_followers"], num),
    ]) + "</div>")

    out.append("<p class='muted'>Engasjementsrate for TikTok = (likes + kommentarer + delinger) / reach "
               "per video. Den er ikke direkte sammenlignbar med Instagram-raten over.</p>")

    out.append(f"<h3>Konsepter {EXAMPLE_TAG}</h3>")
    out.append("<p class='muted'>TikTok har ett format (video), så konseptene sammenlignes direkte med "
               "hverandre, men aldri med Instagram-tallene over.</p>")
    out.append(hbar_chart(
        [(name, views, prev) for name, _, views, prev, *_ in t["concepts"]],
        num, "Median visninger per konsept, TikTok (EKSEMPELTALL)", prev_name))
    rows = [[esc(name) + prelim(n), num(n), num(views), pct(eng), num(shares),
             num(prev) if prev else "–", change_cell(change(views, prev)) if prev else "–"]
            for name, n, views, prev, eng, shares in t["concepts"]]
    out.append(table(["Konsept (eksempeltall)", "Videoer", "Median visninger", "Median eng.",
                      "Median delinger", f"Median visninger {prev_name}", "Endring"], rows))

    out.append("<h3>Datagrunnlag</h3>")
    out.append(table(["Tall i rapporten", "Endepunkt", "Felt", "Scope"],
                     [[a, f"<code>{b}</code>", f"<code>{esc(c)}</code>", f"<code>{d}</code>"]
                      for a, b, c, d in DATA_SOURCES], numeric_from=99))
    out.append("</section>")
    return "\n".join(out)


def anonymize(body):
    """Skjuler captions og lenker til innlegg, og bytter ut kundenavnet."""
    body = re.sub(r'<a href="[^"]*">.*?</a>', HIDDEN_POST, body)
    body = body.replace(CLIENT_NAME, CLIENT_ALIAS)
    leftovers = [w for w in ("instagram.com/p/", "instagram.com/reel/", "youtube.com/", CLIENT_NAME.lower())
                 if w in body.lower()]
    if leftovers:
        raise RuntimeError(f"Anonymiseringen etterlot {leftovers}. Avbryter.")
    return body


def main():
    parser = argparse.ArgumentParser(description="Demo av månedsrapporten med planlagt TikTok-seksjon.")
    parser.add_argument("--måned", "--maned", dest="month", required=True, help="ÅÅÅÅ-MM")
    args = parser.parse_args()

    now = datetime.now(OSLO)
    posts, hist, followers, account = load_all()
    title, body = month_report(posts, hist, followers, now, args.month, load_youtube(account))

    start, _ = month_bounds(args.month)
    prev_start, _ = month_bounds(f"{start - timedelta(days=1):%Y-%m}")
    month_name = f"{MONTHS_NO[start.month - 1]} {start.year}"
    prev_name = f"{MONTHS_NO[prev_start.month - 1]} {prev_start.year}"

    banner = ('<p class="demo-banner">DEMO-versjon. Instagram- og YouTube-delen viser ekte tall fra '
              "Instagram Graph API og YouTube API, anonymisert: kundenavn er byttet ut, og captions, titler "
              "og lenker til innlegg er skjult. Seksjonen «TikTok (planlagt)» viser en planlagt integrasjon "
              "med <b>eksempeltall</b>.</p>")
    body = body.replace("</h1>", "</h1>\n" + banner, 1)
    # Den vanlige rapporten har en «TikTok kommer»-boks; demoen bytter den ut med eksempelseksjonen
    coming = tiktok_coming_section()
    if coming not in body:
        raise RuntimeError("Fant ikke TikTok-plassholderen i rapporten.")
    body = body.replace(coming, tiktok_section(month_name, prev_name), 1)
    body = anonymize(body)

    path = DATA_DIR / f"rapport_maaned_{args.month}_demo_tiktok.html"
    path.write_text(render(f"{title} – demo med TikTok (planlagt)", DEMO_CSS + body), encoding="utf-8")
    print(f"Skrev {path}")


if __name__ == "__main__":
    try:
        main()
    except db.SupabaseError as e:
        sys.exit(f"Feil fra Supabase: {e}")
