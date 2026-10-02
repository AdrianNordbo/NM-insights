"""
NM Insights - regelbasert rapport (ingen LLM).

Lager én selvstendig HTML-fil med tabeller, grafer og automatiske flagg.
Tolkning og anbefalinger skrives manuelt i seksjonen «Vurdering og anbefalinger».

Kjør:
  python report.py --periode måned                  (forrige hele måned)
  python report.py --periode måned --måned 2026-09
  python report.py --periode uke                    (forrige uke; på søndager inneværende uke)
  python report.py --periode uke --uke 2026-W39

Skriver data/rapport_maaned_<ÅÅÅÅ-MM>.html eller data/rapport_uke_<ÅÅÅÅ-Www>.html.
"""
import argparse
import csv
import html
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

import db
import fetch_instagram as meta
from analyze import DATA_DIR, MIN_AGE_DAYS, MIN_POSTS, OSLO, WEEKDAYS, load_posts
from concepts import CONCEPTS_START, FOR_KONSEPTER, UKJENT

CHANGE_FLAG = 0.25       # månedsrapport: endring fra forrige måned som fremheves
DEVIATION_FLAG = 0.50    # ukesrapport: avvik fra konseptets nivå på samme alder
FOLLOWER_COVERAGE = 0.9  # andel dager med følgerdata som kreves for å sammenligne
# Alder i timer for sammenligning på samme alder: (mål, tillatt vindu)
AGE_POINTS = {"24 t": (24, 12, 36), "48 t": (48, 36, 60)}
TIME_TESTS_FILE = Path("time_tests.csv")
UNIQUE_REACH_MAX_DAYS = 30  # Metas grense mellom since og until
TOTAL_METRICS = [
    ("Visninger", "views"), ("Likes", "likes"), ("Kommentarer", "comments"),
    ("Lagringer", "saved"), ("Delinger", "shares"), ("Totale interaksjoner", "total_interactions"),
]
MONTHS_NO = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august",
             "september", "oktober", "november", "desember"]
NON_CONCEPTS = {FOR_KONSEPTER, UKJENT}


# --- Formatering -------------------------------------------------------------

def num(value, decimals=0):
    if value is None or pd.isna(value):
        return "–"
    text = f"{value:,.{decimals}f}".replace(",", " ").replace(".", ",")
    return text


def pct(value, decimals=2):
    return "–" if value is None or pd.isna(value) else f"{num(value * 100, decimals)} %"


def change(new, old):
    if new is None or old is None or pd.isna(new) or pd.isna(old) or old == 0:
        return None
    return new / old - 1


def change_cell(value, threshold=CHANGE_FLAG):
    if value is None:
        return "–"
    text = f"{'+' if value >= 0 else '−'}{num(abs(value) * 100, 0)} %"
    if abs(value) > threshold:
        kind = "up" if value > 0 else "down"
        return f'<span class="flag {kind}">{text}</span>'
    return text


def prelim(n):
    return ' <span class="tag">foreløpig</span>' if n < MIN_POSTS else ""


def esc(text):
    return html.escape(str(text))


def table(headers, rows, numeric_from=1):
    head = "".join(
        f'<th class="{"num" if i >= numeric_from else ""}">{h}</th>' for i, h in enumerate(headers)
    )
    body = "".join(
        "<tr>" + "".join(
            f'<td class="{"num" if i >= numeric_from else ""}">{c}</td>' for i, c in enumerate(r)
        ) + "</tr>"
        for r in rows
    )
    return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


# --- Grafer (inline SVG, ingen avhengigheter) ------------------------------

def hbar_chart(items, value_fmt, title, prev_label=None):
    """Horisontale søyler. items: [(etikett, verdi, forrige verdi eller None)]."""
    items = [i for i in items if i[1] is not None and not pd.isna(i[1])]
    if not items:
        return ""
    has_prev = prev_label and any(p is not None and not pd.isna(p) for _, _, p in items)
    label_w, value_w, width = 150, 70, 640
    bar_h, gap, group_gap = 14, 2, 14
    group_h = bar_h * (2 if has_prev else 1) + (gap if has_prev else 0)
    height = len(items) * (group_h + group_gap)
    vmax = max(max(v, p if (p is not None and not pd.isna(p)) else 0) for _, v, p in items) or 1
    scale = (width - label_w - value_w) / vmax

    def bar(x, y, w, cls, tip):
        w = max(w, 1)
        r = min(4, w)
        path = (f"M{x},{y} H{x + w - r} Q{x + w},{y} {x + w},{y + r} V{y + bar_h - r} "
                f"Q{x + w},{y + bar_h} {x + w - r},{y + bar_h} H{x} Z")
        return f'<path class="{cls}" d="{path}"><title>{esc(tip)}</title></path>'

    parts = []
    for i, (label, value, prev) in enumerate(items):
        y = i * (group_h + group_gap)
        parts.append(f'<text class="axis-label" x="{label_w - 8}" y="{y + group_h / 2 + 4}" '
                     f'text-anchor="end">{esc(label)}</text>')
        parts.append(bar(label_w, y, value * scale, "bar-current", f"{label}: {value_fmt(value)}"))
        parts.append(f'<text class="value-label" x="{label_w + value * scale + 6}" '
                     f'y="{y + bar_h - 3}">{value_fmt(value)}</text>')
        if has_prev and prev is not None and not pd.isna(prev):
            y2 = y + bar_h + gap
            parts.append(bar(label_w, y2, prev * scale, "bar-prev",
                             f"{label}, {prev_label}: {value_fmt(prev)}"))
            parts.append(f'<text class="value-label muted" x="{label_w + prev * scale + 6}" '
                         f'y="{y2 + bar_h - 3}">{value_fmt(prev)}</text>')
    parts.insert(0, f'<line class="baseline" x1="{label_w}" x2="{label_w}" y1="0" y2="{height}"/>')

    legend = ""
    if has_prev:
        legend = ('<div class="legend"><span><i class="swatch current"></i>Denne perioden</span>'
                  f'<span><i class="swatch prev"></i>{esc(prev_label)}</span></div>')
    return (f'<figure><figcaption>{esc(title)}</figcaption>{legend}'
            f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
            + "".join(parts) + "</svg></figure>")


def column_chart(items, title, value_fmt=lambda v: num(v)):
    """Stående søyler per dag. items: [(etikett, verdi eller None)]."""
    if not any(v is not None and not pd.isna(v) for _, v in items):
        return ""
    if not any(v for _, v in items if v is not None and not pd.isna(v)):
        return f"<p class='muted'>{esc(title)}: 0 i hele perioden.</p>"
    width, height, top, bottom, left = 640, 180, 18, 24, 32
    plot_h = height - top - bottom
    vmax = max((v for _, v in items if v is not None and not pd.isna(v)), default=0) or 1
    slot = (width - left) / len(items)
    bar_w = min(24, slot - 2)
    parts = [f'<line class="baseline" x1="{left}" x2="{width}" y1="{top + plot_h}" y2="{top + plot_h}"/>',
             f'<text class="axis-label" x="{left - 6}" y="{top + 4}" text-anchor="end">{value_fmt(vmax)}</text>',
             f'<line class="grid" x1="{left}" x2="{width}" y1="{top}" y2="{top}"/>']
    step = max(1, len(items) // 10)
    for i, (label, value) in enumerate(items):
        x = left + i * slot + (slot - bar_w) / 2
        if value is not None and not pd.isna(value) and value > 0:
            h = value / vmax * plot_h
            y = top + plot_h - h
            r = min(4, h)
            path = (f"M{x},{top + plot_h} V{y + r} Q{x},{y} {x + r},{y} H{x + bar_w - r} "
                    f"Q{x + bar_w},{y} {x + bar_w},{y + r} V{top + plot_h} Z")
            parts.append(f'<path class="bar-current" d="{path}"><title>{esc(label)}: '
                         f'{value_fmt(value)}</title></path>')
        elif value is None or pd.isna(value):
            parts.append(f'<text class="axis-label" x="{x + bar_w / 2}" y="{top + plot_h - 4}" '
                         f'text-anchor="middle">·</text>')
        if i % step == 0:
            parts.append(f'<text class="axis-label" x="{x + bar_w / 2}" y="{height - 6}" '
                         f'text-anchor="middle">{esc(label)}</text>')
    return (f'<figure><figcaption>{esc(title)}</figcaption>'
            f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
            + "".join(parts) + "</svg></figure>")


# --- Data --------------------------------------------------------------------

def load_all():
    posts = load_posts()
    posts["day"] = posts["time"].dt.date
    posts["first_line"] = posts["caption"].fillna("").str.split("\n").str[0].str.slice(0, 80)
    account = db.get_account("instagram", os.getenv("IG_USER_ID"))

    hist = pd.DataFrame(db.select("post_insights", {
        "select": "post_id,snapshot_date,fetched_at,reach,engagement_rate,posts!inner(account_id)",
        "posts.account_id": f"eq.{account['id']}",
        "order": "post_id,snapshot_date",
    }))
    if len(hist):
        hist = hist.drop(columns="posts").merge(
            posts[["id", "time", "concept", "format"]], left_on="post_id", right_on="id")
        hist["fetched_at"] = pd.to_datetime(hist["fetched_at"], utc=True).dt.tz_convert(OSLO)
        hist["age_h"] = (hist["fetched_at"] - hist["time"]).dt.total_seconds() / 3600
        hist["reach"] = pd.to_numeric(hist["reach"])

    followers = pd.DataFrame(db.select("account_insights", {
        "select": "snapshot_date,followers_count,new_followers",
        "account_id": f"eq.{account['id']}",
        "order": "snapshot_date",
    }))
    if len(followers):
        followers["day"] = pd.to_datetime(followers["snapshot_date"]).dt.date
    return posts, hist, followers, account


def reach_at_age(hist):
    """Rekkevidde per innlegg ved 24 t og 48 t: øyeblikksbildet nærmest målet innenfor vinduet."""
    out = {}
    if not len(hist):
        return pd.DataFrame(columns=list(AGE_POINTS))
    for label, (target, lo, hi) in AGE_POINTS.items():
        window = hist[(hist["age_h"] >= lo) & (hist["age_h"] <= hi)].copy()
        window["dist"] = (window["age_h"] - target).abs()
        best = window.sort_values("dist").drop_duplicates("post_id")
        out[label] = best.set_index("post_id")["reach"]
    return pd.DataFrame(out)


def follower_growth(followers, start, end, today):
    """Nye følgere i perioden + dekning (Metas døgn for i dag er aldri ferdig)."""
    last_day = min(end, today - timedelta(days=1))
    expected = (last_day - start).days + 1
    if not len(followers) or expected <= 0:
        return {"sum": None, "days": 0, "expected": max(expected, 0), "first": None, "last": None}
    part = followers[(followers["day"] >= start) & (followers["day"] <= last_day)]
    days = int(part["new_followers"].notna().sum())
    counts = followers[(followers["day"] >= start) & (followers["day"] <= end)].dropna(
        subset=["followers_count"])
    with_data = part.loc[part["new_followers"].notna(), "day"]
    return {
        "sum": part["new_followers"].sum() if days else None,
        "days": days,
        "expected": expected,
        "last_data": with_data.max() if days else None,
        "first": counts.iloc[0] if len(counts) else None,
        "last": counts.iloc[-1] if len(counts) else None,
    }


def follower_text(g):
    if g["sum"] is None:
        return "Ingen følgerdata for perioden."
    text = f"{num(g['sum'])} nye følgere ({g['days']} av {g['expected']} dager med data)"
    if g["last"] is not None:
        text += f". Følgere {g['last']['day']:%d.%m}: {num(g['last']['followers_count'])}"
        if g["first"] is not None and g["first"]["day"] != g["last"]["day"]:
            diff = g["last"]["followers_count"] - g["first"]["followers_count"]
            text += f" ({'+' if diff >= 0 else '−'}{num(abs(diff))} netto siden {g['first']['day']:%d.%m})"
    return text + "."


def complete(g):
    return g["sum"] is not None and g["expected"] and g["days"] / g["expected"] >= FOLLOWER_COVERAGE


def full_coverage(g):
    """Data for alle døgn i perioden (brukes for YouTube-abonnenter, der ett døgn er en stor andel)."""
    return g["sum"] is not None and g["expected"] and g["days"] >= g["expected"]


def coverage_note(g):
    """«29 av 30 døgn med data», eller «data til og med 29.09» når døgn mangler."""
    if g["sum"] is None:
        return "ingen data"
    if g["days"] >= g["expected"]:
        return f"{g['days']} av {g['expected']} døgn med data"
    return f"data til og med {g['last_data']:%d.%m}"


# --- Månedsrapport -----------------------------------------------------------

def month_bounds(ym):
    y, m = map(int, ym.split("-"))
    start = date(y, m, 1)
    end = (date(y + (m == 12), m % 12 + 1, 1)) - timedelta(days=1)
    return start, end


def key_figures(all_posts, mature):
    return {
        "published": len(all_posts),
        "mature": len(mature),
        "reach_sum": mature["reach"].sum() if len(mature) else None,
        "eng_median": mature["engagement_rate"].median() if len(mature) else None,
        "eng_mean": mature["engagement_rate"].mean() if len(mature) else None,
    }


def stat_tile(label, value, delta=None, note=""):
    delta_html = f'<div class="delta">{delta} fra forrige måned</div>' if delta else ""
    note_html = f'<div class="note">{note}</div>' if note else ""
    return f'<div class="tile"><div class="label">{label}</div><div class="value">{value}</div>{delta_html}{note_html}</div>'


def month_report(posts, hist, followers, now, ym, youtube=None):
    today = now.date()
    cutoff = now - timedelta(days=MIN_AGE_DAYS)
    start, end = month_bounds(ym)
    prev_start, prev_end = month_bounds(f"{start - timedelta(days=1):%Y-%m}")
    month_name = f"{MONTHS_NO[start.month - 1]} {start.year}"
    prev_name = f"{MONTHS_NO[prev_start.month - 1]} {prev_start.year}"

    def period(s, e):
        p = posts[(posts["day"] >= s) & (posts["day"] <= e)]
        return p, p[p["time"] <= cutoff]

    cur_all, cur = period(start, end)
    prev_all, prev = period(prev_start, prev_end)
    kf, pkf = key_figures(cur_all, cur), key_figures(prev_all, prev)
    fg = follower_growth(followers, start, end, today)
    pfg = follower_growth(followers, prev_start, prev_end, today)
    flags = []

    out = [f"<h1>Månedsrapport {month_name}</h1>",
           f'<p class="meta">Veksthuset · Instagram og YouTube · generert {now:%d.%m.%Y %H:%M} · '
           f"regelbasert (report.py), ingen LLM</p>"]

    notes, ig_notes = [], []
    if end >= today:
        notes.append(f"Måneden er ikke avsluttet. Data til og med {today:%d.%m.%Y}.")
        flags.append(f"{month_name} er ikke avsluttet: antall innlegg og samlet rekkevidde er ikke "
                     f"sammenlignbare med hele {prev_name}. Bruk medianene.")
    young = cur_all[cur_all["time"] > cutoff]
    if len(young):
        ig_notes.append(f"{len(young)} innlegg yngre enn {MIN_AGE_DAYS} dager er utelatt fra "
                        f"sammenligningene av endelige tall (publisert etter {cutoff:%d.%m %H:%M}).")
    notes.append(f"Grupper med under {MIN_POSTS} innlegg er merket «foreløpig». Endringer over "
                 f"±{int(CHANGE_FLAG * 100)} % fra forrige måned er fremhevet.")
    notes.append("Plattformene og formatene sammenlignes aldri med hverandre; hver plattform har sin egen seksjon.")
    ig_notes.append("Reels og feed sammenlignes ikke på rekkevidde; konseptene sammenlignes innenfor hvert format.")
    out.append("<ul class='notes'>" + "".join(f"<li>{n}</li>" for n in notes) + "</ul>")
    header_len = len(out)
    out.append("<ul class='notes'>" + "".join(f"<li>{n}</li>" for n in ig_notes) + "</ul>")

    ur = unique_reach(start, end, today)
    pur = unique_reach(prev_start, prev_end, today)

    # 1. Nøkkeltall
    out.append("<h2>Nøkkeltall</h2>")
    fg_delta = change_cell(change(fg["sum"], pfg["sum"])) if complete(fg) and complete(pfg) else None
    tiles = [
        stat_tile("Innlegg publisert", num(kf["published"]),
                  change_cell(change(kf["published"], pkf["published"]))),
        stat_tile("Unike kontoer nådd", num(ur["value"]),
                  change_cell(change(ur["value"], pur["value"])) if pur else None,
                  f"hele kontoen, {ur['from']:%d.%m}–{ur['to']:%d.%m}")
        if ur else
        stat_tile("Rekkevidde, sum per innlegg", num(kf["reach_sum"]),
                  change_cell(change(kf["reach_sum"], pkf["reach_sum"])),
                  "samme person kan telles flere ganger"),
        stat_tile("Engasjementsrate (median)", pct(kf["eng_median"]),
                  change_cell(change(kf["eng_median"], pkf["eng_median"])),
                  f"snitt {pct(kf['eng_mean'])}"),
        stat_tile("Nye følgere", num(fg["sum"]), fg_delta,
                  f"{fg['days']} av {fg['expected']} dager med data"),
    ]
    out.append('<div class="tiles">' + "".join(tiles) + "</div>")
    if not (complete(fg) and complete(pfg)):
        flags.append(f"Følgervekst sammenlignes ikke med {prev_name}: for få dager med data "
                     f"({pfg['days']} av {pfg['expected']} i {prev_name}, {fg['days']} av {fg['expected']} i {month_name}).")
    out.append(f"<p>{follower_text(fg)}</p>")

    out.append(totals_section(cur_all, prev_all, ur, pur, fg, pfg, month_name, prev_name, cutoff))

    # Rekkevidde per format (median), med endring
    vm_cur, vm_prev = cur["is_vm"].sum(), prev["is_vm"].sum()
    variants = [("", False)] + ([(" uten VM", True)] if vm_cur or vm_prev else [])
    rows = []
    for f, (suffix, no_vm) in [(f, v) for f in ["Reels", "Feed"] for v in variants]:
        c, p = cur[cur["format"] == f], prev[prev["format"] == f]
        if no_vm:
            c, p = c[~c["is_vm"]], p[~p["is_vm"]]
        ch_reach = change(c["reach"].median(), p["reach"].median())
        ch_eng = change(c["engagement_rate"].median(), p["engagement_rate"].median())
        rows.append([f + suffix + prelim(len(c)), num(len(c)), num(c["reach"].median()), num(p["reach"].median()),
                     change_cell(ch_reach), pct(c["engagement_rate"].median()),
                     pct(p["engagement_rate"].median()), change_cell(ch_eng)])
        for label, ch in [("median rekkevidde", ch_reach), ("median engasjementsrate", ch_eng)]:
            if ch is not None and abs(ch) > CHANGE_FLAG:
                flags.append(f"{f}{suffix}: {label} {change_cell(ch)} fra {prev_name}"
                             + (" (foreløpig)" if min(len(c), len(p)) < MIN_POSTS else "") + ".")
    out.append("<h3>Per format</h3>")
    out.append(table(["Format", "Innlegg", "Median rekkevidde", f"Median {prev_name}", "Endring",
                      "Median eng.", f"Median eng. {prev_name}", "Endring"], rows))

    if vm_cur or vm_prev:
        flags.append(f"VM-innhold: {vm_cur} innlegg i {month_name}, {vm_prev} i {prev_name}. "
                     "Se radene «uten VM» under Per format.")

    # 2. Konseptsammenligning per format
    out.append("<h2>Konsepter per format</h2>")
    for f in ["Reels", "Feed"]:
        c, p = cur[cur["format"] == f], prev[prev["format"] == f]
        if not len(c):
            continue
        rows, chart = [], []
        for concept, g in sorted(c.groupby("concept"), key=lambda kv: -len(kv[1])):
            pg = p[p["concept"] == concept]
            n = len(g)
            ch = change(g["reach"].median(), pg["reach"].median()) if len(pg) else None
            watch = g["watch_time_s"].mean()
            rows.append([
                esc(concept) + prelim(n), num(n), num(g["reach"].median()), num(g["reach"].mean()),
                pct(g["engagement_rate"].median()), num(g["saved"].median()), num(g["shares"].median()),
                f"{num(watch, 1)} s" if not pd.isna(watch) else "–",
                f"{num(len(pg))} / {num(pg['reach'].median())}" if len(pg) else "–",
                change_cell(ch),
            ])
            chart.append((concept, g["reach"].median(), pg["reach"].median() if len(pg) else None))
            if n < MIN_POSTS:
                flags.append(f"{f} – {concept}: {n} innlegg, foreløpig.")
            if ch is not None and abs(ch) > CHANGE_FLAG:
                flags.append(f"{f} – {concept}: median rekkevidde {change_cell(ch)} fra {prev_name}"
                             + (" (foreløpig)" if min(n, len(pg)) < MIN_POSTS else "") + ".")
        out.append(f"<h3>{f}</h3>")
        out.append(hbar_chart(chart, num, f"Median rekkevidde per konsept, {f}", prev_name))
        out.append(table(["Konsept", "Innlegg", "Median rekkevidde", "Snitt rekkevidde", "Median eng.",
                          "Median lagret", "Median delt", "Snitt watch time",
                          f"{prev_name}: innlegg / median", "Endring"], rows))

    # 3. Beste og svakeste innlegg
    out.append("<h2>Beste og svakeste innlegg</h2>")
    out.append(f"<p>Rangert etter rekkevidde innenfor hvert format, blant innlegg ≥ {MIN_AGE_DAYS} dager.</p>")
    for f in ["Reels", "Feed"]:
        c = cur[cur["format"] == f].sort_values("reach", ascending=False)
        if not len(c):
            continue

        def rows_for(d):
            return [[f'<a href="{esc(r.permalink)}">{esc(r.first_line) or "(uten tekst)"}</a>',
                     esc(r.concept), f"{r.time:%d.%m}", num(r.reach), pct(r.engagement_rate)]
                    for r in d.itertuples()]
        headers = ["Innlegg", "Konsept", "Dato", "Rekkevidde", "Eng."]
        out.append(f"<h3>{f}</h3>")
        if len(c) >= 6:
            out.append("<h4>Beste</h4>" + table(headers, rows_for(c.head(3)), numeric_from=3))
            out.append("<h4>Svakeste</h4>" + table(headers, rows_for(c.tail(3).iloc[::-1]), numeric_from=3))
        else:
            out.append(f"<h4>Alle {len(c)} innlegg, rangert{prelim(len(c))}</h4>"
                       + table(headers, rows_for(c), numeric_from=3))

    # 4. Konsepter uten nye innlegg
    active = posts[(posts["day"] >= date.fromisoformat(CONCEPTS_START))
                   & (~posts["concept"].isin(NON_CONCEPTS))]
    for concept in sorted(set(active["concept"]) - set(cur_all["concept"])):
        last = active[active["concept"] == concept]["time"].max()
        flags.append(f"{concept}: ingen nye innlegg i {month_name} (siste {last:%d.%m.%Y}).")

    # Følgervekst per dag
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    fmap = dict(zip(followers["day"], followers["new_followers"])) if len(followers) else {}
    out.append("<h2>Følgervekst</h2>")
    out.append(column_chart([(f"{d:%d}", fmap.get(d)) for d in days], f"Nye følgere per dag, {month_name}"))

    out.append("<h2>Automatiske flagg</h2>")
    out.append("<ul class='flags'>" + "".join(f"<li>{f}</li>" for f in flags) + "</ul>"
               if flags else "<p>Ingen flagg.</p>")

    parts = out[:header_len] + [platform_section("Instagram", demote_headings("\n".join(out[header_len:])))]
    if youtube is not None:
        parts.append(platform_section("YouTube (Shorts)", youtube_month_section(
            youtube, now, start, end, prev_start, prev_end, month_name, prev_name)))
    parts += [tiktok_coming_section(), assessment_section()]
    return f"Månedsrapport {month_name}", "\n".join(parts)


def unique_reach(start, end, today):
    """Unike kontoer nådd for hele kontoen i perioden (alt innhold), fra Meta.

    Meta tillater maks 30 dager per spørring og har ikke dagens døgn ferdig, så
    perioden kuttes til de første 30 dagene og til og med i går. Returnerer None
    hvis API-et ikke svarer."""
    last = min(end, today - timedelta(days=1), start + timedelta(days=UNIQUE_REACH_MAX_DAYS - 1))
    if last < start:
        return None

    def ts(d):
        return int(datetime.combine(d, datetime.min.time(), OSLO).timestamp())
    try:
        data = meta.api_get(f"{meta.IG_USER_ID}/insights", {
            "metric": "reach", "period": "day", "metric_type": "total_value",
            "since": ts(start), "until": ts(last + timedelta(days=1)),
        })
        value = data["data"][0]["total_value"]["value"]
    except (meta.MetaApiError, requests.RequestException, KeyError, IndexError, ValueError):
        return None
    return {"value": value, "from": start, "to": last,
            "days": (last - start).days + 1, "month_days": (end - start).days + 1}


def totals_section(cur_all, prev_all, ur, pur, fg, pfg, month_name, prev_name, cutoff):
    """Summer for alle innlegg publisert i måneden, med endring og per innlegg."""
    n, pn = len(cur_all), len(prev_all)

    def per_post(total, count):
        return None if not count or total is None or pd.isna(total) else total / count

    def pp(total, count):
        value = per_post(total, count)
        return num(value, 1 if value is not None and value < 10 else 0)

    rows = [["<b>Innlegg publisert</b>", num(n), num(pn), change_cell(change(n, pn)), "", ""]]
    if ur:
        rows.append(["Unike kontoer nådd <span class='muted'>(hele kontoen)</span>",
                     num(ur["value"]), num(pur["value"]) if pur else "–",
                     change_cell(change(ur["value"], pur["value"])) if pur else "–", "–", "–"])
    else:
        v, pv = cur_all["reach"].sum(min_count=1), prev_all["reach"].sum(min_count=1)
        rows.append(["Rekkevidde <span class='tag'>sum per innlegg, samme person kan telles flere ganger</span>",
                     num(v), num(pv), change_cell(change(v, pv)),
                     pp(v, n), pp(pv, pn)])
    for label, col in TOTAL_METRICS:
        v, pv = cur_all[col].sum(min_count=1), prev_all[col].sum(min_count=1)
        rows.append([label, num(v), num(pv), change_cell(change(v, pv)),
                     pp(v, n), pp(pv, pn)])
    fg_ok = complete(fg) and complete(pfg)
    rows.append(["Nye følgere", num(fg["sum"]), num(pfg["sum"]),
                 change_cell(change(fg["sum"], pfg["sum"])) if fg_ok else "–", "–", "–"])

    young = (cur_all["time"] > cutoff).sum()
    notes = [
        f"Summene gjelder alle innlegg publisert i måneden, med siste måling. De påvirkes av antall "
        f"innlegg ({n} mot {pn}), så se også «per innlegg»."
        + (f" {young} av innleggene er yngre enn {MIN_AGE_DAYS} dager og samler fortsatt tall." if young else ""),
    ]
    if ur:
        def span(u):
            text = f"{u['from']:%d.%m}–{u['to']:%d.%m}"
            return text + (f" ({u['days']} av {u['month_days']} dager)" if u["days"] < u["month_days"] else "")
        notes.append(
            "Unike kontoer nådd er Metas tall for hele kontoen: alle kontoer som så noe av innholdet "
            "(også eldre innlegg og historier) i perioden, hver telt én gang. Det er derfor ikke begrenset "
            f"til innleggene publisert i måneden. Periode: {month_name} {span(ur)}"
            + (f", {prev_name} {span(pur)}" if pur else "")
            + f". Meta gir maks {UNIQUE_REACH_MAX_DAYS} dager per spørring, og døgnene følger Metas tidssone.")
    else:
        notes.append("Meta svarte ikke med unik rekkevidde for kontoen, så rekkevidde vises som sum per innlegg.")
    if not fg_ok:
        notes.append(f"Nye følgere sammenlignes ikke: for få dager med data "
                     f"({fg['days']} av {fg['expected']} og {pfg['days']} av {pfg['expected']}).")

    return ("<h2>Totalt for måneden</h2>"
            + table(["", month_name.capitalize(), prev_name.capitalize(), "Endring",
                     f"Per innlegg {month_abbr(month_name)}", f"Per innlegg {month_abbr(prev_name)}"], rows)
            + "<ul class='notes'>" + "".join(f"<li>{t}</li>" for t in notes) + "</ul>")


def month_abbr(name):
    return name.split()[0][:3]


def assessment_section():
    return """<h2>Vurdering og anbefalinger</h2>
<section class="assessment">
<!-- VURDERING: fylles ut manuelt (Adrian med Claude Code). Ikke generert. -->
<h3>Vurdering</h3>
<p class="placeholder">Fylles ut manuelt.</p>
<h3>Beslutninger om konsepter</h3>
<p class="placeholder">Fylles ut manuelt.</p>
<h3>Til produsenten</h3>
<p class="placeholder">Fylles ut manuelt. Skriv slik at teksten kan sendes videre direkte.</p>
<h3>Planlegging og tester neste periode</h3>
<p class="placeholder">Fylles ut manuelt.</p>
</section>"""


# --- Ukesrapport -------------------------------------------------------------

def week_bounds(iso):
    y, w = iso.split("-W")
    start = date.fromisocalendar(int(y), int(w), 1)
    return start, start + timedelta(days=6)


def load_time_tests():
    if not TIME_TESTS_FILE.exists():
        return []
    with open(TIME_TESTS_FILE, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f, delimiter=";") if (r.get("navn") or "").strip()]


def baseline_for(concept, fmt, ages, posts, before):
    """Konseptets vanlige nivå på samme alder: median av tidligere innlegg."""
    prior = posts[(posts["concept"] == concept) & (posts["format"] == fmt) & (posts["time"] < before)]
    result = {}
    for label in AGE_POINTS:
        values = ages[label].reindex(prior["id"]).dropna() if label in ages else pd.Series(dtype=float)
        result[label] = (values.median() if len(values) >= MIN_POSTS else None, len(values))
    return result


def week_report(posts, hist, followers, now, iso, youtube=None):
    today = now.date()
    start, end = week_bounds(iso)
    week_start_dt = datetime.combine(start, datetime.min.time(), OSLO)
    ages = reach_at_age(hist)
    week = posts[(posts["day"] >= start) & (posts["day"] <= end)].sort_values("time")
    _, week_no = iso.split("-W")

    out = [f"<h1>Ukesrapport uke {int(week_no)} ({start:%d.%m}–{end:%d.%m.%Y})</h1>",
           f'<p class="meta">Veksthuset · Instagram og YouTube · generert {now:%d.%m.%Y %H:%M} · '
           "regelbasert (report.py), ingen LLM</p>",
           "<ul class='notes'>"
           f"<li>Konseptets nivå krever minst {MIN_POSTS} tidligere innlegg med måling på samme alder. "
           "Ellers står det at historikken mangler, i stedet for et anslag.</li>"
           "<li>Plattformene sammenlignes aldri med hverandre; hver plattform har sin egen seksjon.</li>"
           "<li>Konseptbeslutninger tas i månedsrapporten, ikke her.</li></ul>"]
    header_len = len(out)
    out.append("<ul class='notes'>"
               "<li>Ukens innlegg sammenlignes med konseptets vanlige nivå <b>på samme alder</b> "
               "(rekkevidde ca. 24 og 48 timer etter publisering), fra historikken i post_insights.</li>"
               f"<li>Tydelig avvik: over ±{int(DEVIATION_FLAG * 100)} % fra konseptets nivå.</li></ul>")

    # 1. Ukens innlegg mot konseptets nivå
    out.append(f"<h2>Ukens innlegg ({len(week)})</h2>")
    rows, deviations, missing = [], [], set()
    for r in week.itertuples():
        base = baseline_for(r.concept, r.format, ages, posts, week_start_dt)
        cells = []
        for label in AGE_POINTS:
            value = ages[label].get(r.id) if label in ages else None
            median, n = base[label]
            if value is None or pd.isna(value):
                cells.append("ikke målt")
            elif median is None:
                cells.append(f"{num(value)} <span class='muted'>(nivå mangler: {n} av {MIN_POSTS})</span>")
                missing.add((r.format, r.concept))
            else:
                dev = change(value, median)
                cells.append(f"{num(value)} mot {num(median)}: {change_cell(dev, DEVIATION_FLAG)}")
                if dev is not None and abs(dev) > DEVIATION_FLAG:
                    deviations.append((r, label, value, median, dev))
        age_days = (now - r.time).total_seconds() / 86400
        rows.append([f'<a href="{esc(r.permalink)}">{esc(r.first_line) or "(uten tekst)"}</a>',
                     esc(r.concept), r.format, f"{r.weekday[:3]} {r.time:%d.%m %H:%M}",
                     *cells, f"{num(r.reach)} ({num(age_days, 0)} d)"])
    if len(week):
        out.append(table(["Innlegg", "Konsept", "Format", "Publisert", "Rekkevidde 24 t",
                          "Rekkevidde 48 t", "Rekkevidde nå (alder)"], rows, numeric_from=4))
    else:
        out.append("<p>Ingen innlegg denne uken.</p>")
    if missing:
        out.append("<p class='callout'><b>Ikke nok historikk ennå</b> for sammenligning på samme alder: "
                   + ", ".join(f"{c} ({f})" for f, c in sorted(missing))
                   + f". Nivået beregnes når minst {MIN_POSTS} tidligere innlegg i konseptet er målt "
                   "ca. 24 og 48 timer etter publisering. Den daglige kjøringen bygger denne historikken.</p>")
    unmeasured = [r for r in week.itertuples()
                  if all(pd.isna(ages[l].get(r.id)) if l in ages else True for l in AGE_POINTS)]
    if unmeasured:
        out.append(f"<p class='muted'>{len(unmeasured)} av ukens innlegg har ingen måling nær 24 eller "
                   "48 timer (historikken i post_insights startet 29.09.2026).</p>")

    # 2. Tydelige avvik
    out.append("<h2>Tydelige avvik</h2>")
    if deviations:
        items = "".join(
            f"<li>{'Over' if d > 0 else 'Under'} nivå: «{esc(r.first_line)}» ({esc(r.concept)}, {label}): "
            f"{num(v)} mot {num(m)} ({change_cell(d, DEVIATION_FLAG)})</li>"
            for r, label, v, m, d in sorted(deviations, key=lambda x: -x[4]))
        out.append(f"<ul class='flags'>{items}</ul>")
    elif missing or unmeasured:
        out.append("<p>Kan ikke vurderes ennå: mangler historikk på samme alder (se over).</p>")
    else:
        out.append(f"<p>Ingen innlegg avviker mer enn ±{int(DEVIATION_FLAG * 100)} % fra konseptets nivå.</p>")

    # 3. Tidspunkt-tester
    out.append("<h2>Tidspunkt-tester</h2>")
    out.append(time_tests_section(posts, ages, now))

    # 4. Følgervekst
    g = follower_growth(followers, start, end, today)
    fmap = dict(zip(followers["day"], followers["new_followers"])) if len(followers) else {}
    days = [start + timedelta(days=i) for i in range(7)]
    out.append("<h2>Følgervekst</h2>")
    out.append(f"<p>{follower_text(g)}</p>")
    out.append(column_chart([(f"{WEEKDAYS[d.weekday()][:3]} {d:%d}", fmap.get(d)) for d in days],
                            f"Nye følgere per dag, uke {int(week_no)}"))

    parts = out[:header_len] + [platform_section("Instagram", demote_headings("\n".join(out[header_len:])))]
    if youtube is not None:
        parts.append(platform_section("YouTube (Shorts)", youtube_week_section(youtube, now, start, end, week_no)))
    parts.append(tiktok_coming_section())
    parts.append("""<h2>Justeringer neste uke</h2>
<section class="assessment">
<!-- VURDERING: fylles ut manuelt. Tidspunkt, rekkefølge og tester, ikke konsepter. -->
<p class="placeholder">Fylles ut manuelt.</p>
</section>""")
    return f"Ukesrapport uke {int(week_no)}", "\n".join(parts)


def time_tests_section(posts, ages, now):
    tests = load_time_tests()
    if not tests:
        return ("<p>Ingen tidspunkt-tester registrert. Legg dem inn i <code>time_tests.csv</code> "
                "(kolonner: navn;konsept;format;fra;til;tidsrom, f.eks. "
                "<code>Sitcom kveld;Sitcom;Reels;2026-10-05;2026-11-01;19-21</code>). "
                "Testinnleggene sammenlignes med samme konsept og format publisert på andre tidspunkt.</p>")
    cutoff = now - timedelta(days=MIN_AGE_DAYS)
    rows = []
    for t in tests:
        lo, hi = map(int, t["tidsrom"].split("-"))
        fra, til = date.fromisoformat(t["fra"]), date.fromisoformat(t["til"])
        same = posts[(posts["concept"] == t["konsept"]) & (posts["format"] == t["format"])
                     & (posts["day"] >= date.fromisoformat(CONCEPTS_START))]
        in_slot = same["hour"].between(lo, hi - 1)
        test = same[(same["day"] >= fra) & (same["day"] <= til) & in_slot]
        control = same[~in_slot]
        status = "pågår" if til >= now.date() else "avsluttet"
        cells = []
        for label in AGE_POINTS:
            tv = ages[label].reindex(test["id"]).dropna() if label in ages else pd.Series(dtype=float)
            cv = ages[label].reindex(control["id"]).dropna() if label in ages else pd.Series(dtype=float)
            if not len(tv) or not len(cv):
                cells.append("ikke nok målinger")
            else:
                cells.append(f"{num(tv.median())} mot {num(cv.median())} ({change_cell(change(tv.median(), cv.median()))})"
                             + prelim(min(len(tv), len(cv))))
        tm, cm = test[test["time"] <= cutoff], control[control["time"] <= cutoff]
        final = (f"{num(tm['reach'].median())} mot {num(cm['reach'].median())} "
                 f"({change_cell(change(tm['reach'].median(), cm['reach'].median()))})"
                 + prelim(min(len(tm), len(cm)))) if len(tm) and len(cm) else "ingen innlegg ≥ 7 dager ennå"
        rows.append([esc(t["navn"]), f"{esc(t['konsept'])} ({esc(t['format'])})",
                     f"{fra:%d.%m}–{til:%d.%m}, kl. {lo}–{hi}", status,
                     f"{len(test)} / {len(control)}", *cells, final])
    return table(["Test", "Konsept", "Periode og tid", "Status", "Test / kontroll",
                  "Median 24 t", "Median 48 t", "Median endelig rekkevidde"], rows, numeric_from=4)


# --- Plattformseksjoner -------------------------------------------------------

def demote_headings(html_text):
    """Flytter overskrifter ett nivå ned (h2→h3 osv.), for innhold som legges under en plattform."""
    for level in (4, 3, 2):
        html_text = (html_text.replace(f"<h{level}", f"<h{level + 1}")
                     .replace(f"</h{level}>", f"</h{level + 1}>"))
    return html_text


def platform_section(title, body, css_class="platform"):
    return f'<section class="{css_class}"><h2 class="platform-title">{title}</h2>\n{body}\n</section>'


def tiktok_coming_section():
    """Plassholder. demo_report.py bytter den ut med eksempelseksjonen."""
    return ('<section class="platform platform-coming" id="tiktok">'
            '<h2 class="platform-title">TikTok <span class="tag">kommer</span></h2>'
            '<p class="muted">TikTok kobles til når API-tilgangen er godkjent. Seksjonen får samme oppsett '
            'som YouTube: nøkkeltall, konsepter og beste og svakeste innlegg.</p></section>')


# --- YouTube -----------------------------------------------------------------

PACIFIC = ZoneInfo("America/Los_Angeles")
YT_NUMERIC = ["views", "likes", "comments", "a_views", "estimated_minutes_watched",
              "average_view_duration_s", "average_view_percentage"]


def load_youtube(instagram_account):
    """YouTube-kontoen til samme kunde. Returnerer None hvis kunden ikke har YouTube."""
    accounts = db.select("accounts", {"select": "id", "platform": "eq.youtube",
                                      "client_name": f"eq.{instagram_account['client_name']}",
                                      "order": "id"})
    if not accounts:
        return None
    account_id = accounts[0]["id"]
    videos = pd.DataFrame(db.select("youtube_videos_latest", {
        "select": "id,published_at,title,format,concept,special_event,permalink,analytics_end_date,"
                  + ",".join(YT_NUMERIC),
        "account_id": f"eq.{account_id}",
        "order": "id",
    }))
    if not len(videos):
        return None
    videos[YT_NUMERIC] = videos[YT_NUMERIC].apply(pd.to_numeric)
    published = pd.to_datetime(videos["published_at"], utc=True)
    videos["time"] = published.dt.tz_convert(OSLO)
    videos["day"] = videos["time"].dt.date
    videos["pday"] = published.dt.tz_convert(PACIFIC).dt.date   # Analytics-døgn
    videos["weekday"] = videos["time"].dt.weekday.map(lambda i: WEEKDAYS[i])
    videos["analytics_end_date"] = pd.to_datetime(videos["analytics_end_date"]).dt.date
    videos["title"] = videos["title"].fillna("")

    daily = pd.DataFrame(db.select("youtube_video_daily", {
        "select": "video_id,day,views,youtube_videos!inner(account_id)",
        "youtube_videos.account_id": f"eq.{account_id}",
        "order": "video_id,day",
    }))
    if len(daily):
        daily = daily.drop(columns="youtube_videos")
        daily["day"] = pd.to_datetime(daily["day"]).dt.date
        daily["views"] = pd.to_numeric(daily["views"])

    followers = pd.DataFrame(db.select("account_insights", {
        "select": "snapshot_date,followers_count,new_followers",
        "account_id": f"eq.{account_id}",
        "order": "snapshot_date",
    }))
    if len(followers):
        followers["day"] = pd.to_datetime(followers["snapshot_date"]).dt.date
    return {"videos": videos, "daily": daily, "followers": followers,
            "analytics_last": daily["day"].max() if len(daily) else None}


def yt_deep_covered(videos):
    """Dype mål brukes bare når Analytics dekker videoens første 7 døgn (Stillehavstid)."""
    return videos["analytics_end_date"].notna() & (
        videos["analytics_end_date"] >= videos["pday"] + timedelta(days=MIN_AGE_DAYS))


def yt_notes(analytics_end, excluded_period, excluded_total, young, extra=()):
    notes = [
        "Hovedtall fra YouTube Data API (visninger, likes, kommentarer), hentet i sanntid.",
        f"Gjennomsnittlig visningstid og andel sett er fra YouTube Analytics, og brukes bare for videoer "
        f"der Analytics dekker de første {MIN_AGE_DAYS} døgnene (Analytics har tall til og med "
        f"{analytics_end:%d.%m.%Y})." if analytics_end else "YouTube Analytics har ingen tall ennå.",
        "Andel sett kan være over 100 %, fordi Shorts spilles i loop. Tallet er ikke kappet.",
        "YouTube har ikke rekkevidde per video, så engasjementsrate sammenlignes ikke med Instagram.",
    ]
    if young:
        notes.append(f"{young} Shorts yngre enn {MIN_AGE_DAYS} dager er utelatt fra sammenligningene.")
    notes.append(f"Videoer med format VIDEO (vanlige videoer, ikke Shorts) holdes utenfor Shorts-analysen: "
                 f"{excluded_period} i perioden, {excluded_total} totalt på kanalen.")
    notes += list(extra)
    return "<ul class='notes'>" + "".join(f"<li>{n}</li>" for n in notes) + "</ul>"


def yt_rank_rows(d):
    return [[f'<a href="{esc(r.permalink)}">{esc(r.title) or "(uten tittel)"}</a>', esc(r.concept),
             f"{r.time:%d.%m}", num(r.views), num(r.likes)] for r in d.itertuples()]


def youtube_month_section(yt, now, start, end, prev_start, prev_end, month_name, prev_name):
    today = now.date()
    cutoff = now - timedelta(days=MIN_AGE_DAYS)
    v = yt["videos"]
    analytics_end = v["analytics_end_date"].dropna().max() if v["analytics_end_date"].notna().any() else None

    def period(s, e):
        p = v[(v["day"] >= s) & (v["day"] <= e)]
        shorts = p[p["format"] == "SHORTS"]
        return p, shorts, shorts[shorts["time"] <= cutoff]

    cur_all, cur_shorts, cur = period(start, end)
    prev_all, prev_shorts, prev = period(prev_start, prev_end)
    excluded = int((cur_all["format"] != "SHORTS").sum())
    excluded_total = int((v["format"] != "SHORTS").sum())
    young = int((cur_shorts["time"] > cutoff).sum())
    fg = follower_growth(yt["followers"], start, end, today)
    pfg = follower_growth(yt["followers"], prev_start, prev_end, today)
    # Nye abonnenter sammenlignes bare når begge månedene har data for alle døgn: tallene er små,
    # og ett manglende døgn (Analytics ligger 2–3 døgn etter) kan gi stor prosentvis endring.
    fg_ok = full_coverage(fg) and full_coverage(pfg)
    flags = []
    if end >= today:
        flags.append(f"{month_name} er ikke avsluttet: antall Shorts og summer er ikke sammenlignbare med hele "
                     f"{prev_name}. Bruk medianene.")
    out = [yt_notes(analytics_end, excluded, excluded_total, young)]

    # Nøkkeltall
    out.append("<h3>Nøkkeltall (Shorts)</h3>")
    tiles = [
        stat_tile("Shorts publisert", num(len(cur_shorts)), change_cell(change(len(cur_shorts), len(prev_shorts)))),
        stat_tile("Visninger", num(cur_shorts["views"].sum(min_count=1)),
                  change_cell(change(cur_shorts["views"].sum(), prev_shorts["views"].sum())),
                  "sum for Shorts publisert i måneden"),
        stat_tile("Visninger per Short (median)", num(cur["views"].median()),
                  change_cell(change(cur["views"].median(), prev["views"].median())),
                  f"{len(cur)} Shorts ≥ {MIN_AGE_DAYS} dager"),
        stat_tile("Nye abonnenter", num(fg["sum"]),
                  change_cell(change(fg["sum"], pfg["sum"])) if fg_ok else None,
                  coverage_note(fg)),
    ]
    out.append('<div class="tiles">' + "".join(tiles) + "</div>")
    ch = change(cur["views"].median(), prev["views"].median())
    if ch is not None and abs(ch) > CHANGE_FLAG:
        flags.append(f"Median visninger per Short {change_cell(ch)} fra {prev_name}"
                     + (" (foreløpig)" if min(len(cur), len(prev)) < MIN_POSTS else "") + ".")
    if not fg_ok:
        flags.append(f"Nye abonnenter sammenlignes ikke med {prev_name}: sammenligning krever data for alle døgn "
                     f"({month_name}: {coverage_note(fg)}, {fg['days']} av {fg['expected']} døgn; "
                     f"{prev_name}: {pfg['days']} av {pfg['expected']} døgn).")

    # Totalt for måneden
    n, pn = len(cur_shorts), len(prev_shorts)

    def pp(total, count):
        value = None if not count or pd.isna(total) else total / count
        return num(value, 1 if value is not None and value < 10 else 0)

    rows = [["<b>Shorts publisert</b>", num(n), num(pn), change_cell(change(n, pn)), "", ""]]
    for label, col in [("Visninger", "views"), ("Likes", "likes"), ("Kommentarer", "comments")]:
        a, b = cur_shorts[col].sum(min_count=1), prev_shorts[col].sum(min_count=1)
        rows.append([label, num(a), num(b), change_cell(change(a, b)), pp(a, n), pp(b, pn)])
    if fg_ok:
        rows.append(["Nye abonnenter <span class='muted'>(hele kanalen)</span>", num(fg["sum"]), num(pfg["sum"]),
                     change_cell(change(fg["sum"], pfg["sum"])), "–", "–"])
    else:
        rows.append(["Nye abonnenter <span class='muted'>(hele kanalen)</span>",
                     f"{num(fg['sum'])} <span class='muted'>({coverage_note(fg)})</span>", "–", "–", "–", "–"])
    out.append("<h3>Totalt for måneden</h3>")
    out.append(table(["", month_name.capitalize(), prev_name.capitalize(), "Endring",
                      f"Per Short {month_abbr(month_name)}", f"Per Short {month_abbr(prev_name)}"], rows))
    out.append(f"<ul class='notes'><li>Summene gjelder alle Shorts publisert i måneden (Data API, siste "
               f"måling), også de som er yngre enn {MIN_AGE_DAYS} dager. De påvirkes av antall videoer "
               f"({n} mot {pn}), så se også «per Short».</li></ul>")

    # Konsepter
    out.append("<h3>Konsepter (Shorts)</h3>")
    if len(cur):
        deep = yt_deep_covered(cur)
        rows, chart = [], []
        for concept, g in sorted(cur.groupby("concept"), key=lambda kv: -len(kv[1])):
            pg = prev[prev["concept"] == concept]
            gd = g[deep.loc[g.index]]
            count = len(g)
            ch = change(g["views"].median(), pg["views"].median()) if len(pg) else None
            rows.append([
                esc(concept) + prelim(count), num(count), num(g["views"].median()), num(g["views"].mean()),
                num(g["likes"].median()), num(g["comments"].median()),
                num(len(gd)) + prelim(len(gd)) if len(gd) else "0",
                f"{num(gd['average_view_duration_s'].median(), 1)} s" if len(gd) else "–",
                f"{num(gd['average_view_percentage'].median(), 1)} %" if len(gd) else "–",
                f"{num(len(pg))} / {num(pg['views'].median())}" if len(pg) else "–",
                change_cell(ch),
            ])
            chart.append((concept, g["views"].median(), pg["views"].median() if len(pg) else None))
            if count < MIN_POSTS:
                flags.append(f"Shorts – {concept}: {count} videoer, foreløpig.")
            if ch is not None and abs(ch) > CHANGE_FLAG:
                flags.append(f"Shorts – {concept}: median visninger {change_cell(ch)} fra {prev_name}"
                             + (" (foreløpig)" if min(count, len(pg)) < MIN_POSTS else "") + ".")
        out.append(hbar_chart(chart, num, "Median visninger per konsept, Shorts", prev_name))
        out.append(table(["Konsept", "Videoer", "Median visninger", "Snitt visninger", "Median likes",
                          "Median kommentarer", "Med Analytics", "Median visningstid", "Median andel sett",
                          f"{prev_name}: videoer / median", "Endring"], rows))
        out.append("<p class='muted'>«Med Analytics» = antall videoer der Analytics dekker de første "
                   f"{MIN_AGE_DAYS} døgnene. Visningstid og andel sett er beregnet bare på dem.</p>")
    else:
        out.append(f"<p>Ingen Shorts ≥ {MIN_AGE_DAYS} dager i {month_name}.</p>")

    # Beste og svakeste
    out.append("<h3>Beste og svakeste Shorts</h3>")
    ranked = cur.sort_values("views", ascending=False)
    headers = ["Video", "Konsept", "Dato", "Visninger", "Likes"]
    if len(ranked) >= 6:
        out.append("<h4>Beste</h4>" + table(headers, yt_rank_rows(ranked.head(3)), numeric_from=3))
        out.append("<h4>Svakeste</h4>" + table(headers, yt_rank_rows(ranked.tail(3).iloc[::-1]), numeric_from=3))
    elif len(ranked):
        out.append(f"<h4>Alle {len(ranked)} Shorts, rangert{prelim(len(ranked))}</h4>"
                   + table(headers, yt_rank_rows(ranked), numeric_from=3))
    out.append(f"<p class='muted'>Rangert etter visninger (Data API), blant Shorts ≥ {MIN_AGE_DAYS} dager.</p>")

    # Konsepter uten nye Shorts
    active = v[(v["day"] >= date.fromisoformat(CONCEPTS_START)) & (v["format"] == "SHORTS")
               & (~v["concept"].isin(NON_CONCEPTS))]
    for concept in sorted(set(active["concept"]) - set(cur_shorts["concept"])):
        last = active[active["concept"] == concept]["time"].max()
        flags.append(f"{concept}: ingen nye Shorts i {month_name} (siste {last:%d.%m.%Y}).")

    # Nye abonnenter per døgn
    fmap = dict(zip(yt["followers"]["day"], yt["followers"]["new_followers"])) if len(yt["followers"]) else {}
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    out.append("<h3>Nye abonnenter</h3>")
    out.append(column_chart([(f"{d:%d}", fmap.get(d)) for d in days],
                            f"Nye abonnenter per døgn (Stillehavstid), {month_name}"))

    out.append("<h3>Automatiske flagg</h3>")
    out.append("<ul class='flags'>" + "".join(f"<li>{f}</li>" for f in flags) + "</ul>"
               if flags else "<p>Ingen flagg.</p>")
    return "\n".join(out)


def yt_views_day01(yt):
    """Visninger i publiseringsdøgnet + neste døgn (Stillehavstid) per video, fra youtube_video_daily.
    Bare videoer der Analytics dekker begge døgnene."""
    v, daily, last = yt["videos"], yt["daily"], yt["analytics_last"]
    if not len(daily) or last is None:
        return pd.Series(dtype=float)
    first_day = v.set_index("id")["pday"]
    d = daily.merge(first_day.rename("pday"), left_on="video_id", right_index=True)
    d = d[(d["day"] >= d["pday"]) & (d["day"] <= d["pday"] + timedelta(days=1))]
    sums = d.groupby("video_id")["views"].sum()
    covered = first_day[first_day + timedelta(days=1) <= last].index
    return sums.reindex(covered).fillna(0)


def youtube_week_section(yt, now, start, end, week_no):
    today = now.date()
    v = yt["videos"]
    week_all = v[(v["day"] >= start) & (v["day"] <= end)].sort_values("time")
    week = week_all[week_all["format"] == "SHORTS"]
    excluded = int((week_all["format"] != "SHORTS").sum())
    excluded_total = int((v["format"] != "SHORTS").sum())
    last = yt["analytics_last"]
    day01 = yt_views_day01(yt)
    week_start_dt = datetime.combine(start, datetime.min.time(), OSLO)
    prior = v[(v["format"] == "SHORTS") & (v["time"] < week_start_dt)]

    out = [yt_notes(last, excluded, excluded_total, 0, extra=[
        "<b>Samme alder</b> = visninger i publiseringsdøgnet pluss neste døgn, i Stillehavstid "
        "(America/Los_Angeles), fra YouTube Analytics (youtube_video_daily). Det er <b>ikke</b> nøyaktig "
        "24 eller 48 timer: hvor mange timer det dekker, avhenger av når på døgnet videoen ble publisert.",
        f"Konseptets nivå = median for tidligere Shorts i samme konsept, og krever minst {MIN_POSTS}. "
        f"Tydelig avvik: over ±{int(DEVIATION_FLAG * 100)} %.",
    ])]

    out.append(f"<h3>Ukens Shorts ({len(week)})</h3>")
    rows, deviations, missing, waiting = [], [], set(), 0
    for r in week.itertuples():
        base_values = day01.reindex(prior[prior["concept"] == r.concept]["id"]).dropna()
        median = base_values.median() if len(base_values) >= MIN_POSTS else None
        if r.id not in day01.index:
            cell = "<span class='muted'>venter på Analytics</span>"
            waiting += 1
        elif median is None:
            cell = f"{num(day01[r.id])} <span class='muted'>(nivå mangler: {len(base_values)} av {MIN_POSTS})</span>"
            missing.add(r.concept)
        else:
            dev = change(day01[r.id], median)
            cell = f"{num(day01[r.id])} mot {num(median)}: {change_cell(dev, DEVIATION_FLAG)}"
            if dev is not None and abs(dev) > DEVIATION_FLAG:
                deviations.append((r, day01[r.id], median, dev))
        age_days = (now - r.time).total_seconds() / 86400
        rows.append([f'<a href="{esc(r.permalink)}">{esc(r.title) or "(uten tittel)"}</a>', esc(r.concept),
                     f"{r.weekday[:3]} {r.time:%d.%m %H:%M}", cell,
                     f"{num(r.views)} ({num(age_days, 0)} d)"])
    if len(week):
        out.append(table(["Video", "Konsept", "Publisert", "Visninger døgn 0–1 mot konseptets nivå",
                          "Visninger nå (alder)"], rows, numeric_from=3))
    else:
        out.append("<p>Ingen Shorts denne uken.</p>")
    if waiting:
        out.append(f"<p class='muted'>{waiting} av ukens Shorts venter på Analytics (tall til og med "
                   f"{last:%d.%m.%Y} i Stillehavstid).</p>" if last else "")
    if missing:
        out.append("<p class='callout'><b>Ikke nok historikk</b> for sammenligning på samme alder: "
                   + ", ".join(sorted(missing)) + f" (krever {MIN_POSTS} tidligere Shorts).</p>")

    out.append("<h3>Tydelige avvik</h3>")
    if deviations:
        out.append("<ul class='flags'>" + "".join(
            f"<li>{'Over' if d > 0 else 'Under'} nivå: «{esc(r.title)}» ({esc(r.concept)}): "
            f"{num(val)} mot {num(m)} visninger døgn 0–1 ({change_cell(d, DEVIATION_FLAG)})</li>"
            for r, val, m, d in sorted(deviations, key=lambda x: -x[3])) + "</ul>")
    elif waiting == len(week) and len(week):
        out.append("<p>Kan ikke vurderes ennå: Analytics har ikke tall for ukens Shorts.</p>")
    else:
        out.append(f"<p>Ingen Shorts med tall avviker mer enn ±{int(DEVIATION_FLAG * 100)} % fra konseptets nivå."
                   + (" Noen venter fortsatt på Analytics." if waiting else "") + "</p>")

    out.append("<h3>Tidspunkt-tester</h3><p class='muted'>Tidspunkt-tester følges foreløpig bare opp for Instagram.</p>")

    g = follower_growth(yt["followers"], start, end, today)
    fmap = dict(zip(yt["followers"]["day"], yt["followers"]["new_followers"])) if len(yt["followers"]) else {}
    days = [start + timedelta(days=i) for i in range(7)]
    out.append("<h3>Nye abonnenter</h3>")
    text = follower_text(g).replace("følgere", "abonnenter").replace("Følgere", "Abonnenter")
    out.append(f"<p>{text.replace('dager', 'døgn')}</p>")
    out.append(column_chart([(f"{WEEKDAYS[d.weekday()][:3]} {d:%d}", fmap.get(d)) for d in days],
                            f"Nye abonnenter per døgn (Stillehavstid), uke {int(week_no)}"))
    return "\n".join(out)


# --- HTML-ramme --------------------------------------------------------------

CSS = """
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6; --series-prev: #c3c2b7;
  --up: #006300; --down: #b42828; --tag-bg: #f0efec; --callout: #fdf6e3;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --series-1: #3987e5; --series-prev: #52514e;
    --up: #0ca30c; --down: #e66767; --tag-bg: #2c2c2a; --callout: #2a2616;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --series-1: #3987e5; --series-prev: #52514e;
  --up: #0ca30c; --down: #e66767; --tag-bg: #2c2c2a; --callout: #2a2616;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 40px 0 12px; padding-top: 16px; border-top: 1px solid var(--grid); }
h3 { font-size: 16px; margin: 24px 0 8px; }
h4 { font-size: 13px; margin: 16px 0 6px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; }
.meta, .muted { color: var(--muted); }
.notes { color: var(--ink-2); padding-left: 20px; }
a { color: var(--series-1); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .label { color: var(--ink-2); font-size: 13px; }
.tile .value { font-size: 28px; font-weight: 600; margin: 2px 0; }
.tile .delta, .tile .note { font-size: 13px; color: var(--ink-2); }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--grid); vertical-align: top; }
th { color: var(--ink-2); font-weight: 600; font-size: 13px; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tag { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: var(--tag-bg); color: var(--ink-2); font-weight: 500; }
.flag { font-weight: 600; }
.flag.up { color: var(--up); } .flag.up::before { content: "▲ "; font-size: 10px; }
.flag.down { color: var(--down); } .flag.down::before { content: "▼ "; font-size: 10px; }
.flags li { margin: 4px 0; }
.callout { background: var(--callout); border-radius: 8px; padding: 10px 14px; }
figure { margin: 16px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
figcaption { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.bar-current { fill: var(--series-1); } .bar-prev { fill: var(--series-prev); }
.baseline { stroke: var(--axis); stroke-width: 1; } .grid { stroke: var(--grid); stroke-width: 1; }
.axis-label { fill: var(--muted); font-size: 12px; }
.value-label { fill: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; }
.value-label.muted { fill: var(--muted); }
.legend { display: flex; gap: 16px; font-size: 13px; color: var(--ink-2); margin-bottom: 8px; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.swatch.current { background: var(--series-1); } .swatch.prev { background: var(--series-prev); }
.platform-title { font-size: 26px; margin: 56px 0 4px; padding-top: 20px; border-top: 3px solid var(--ink); }
.platform h3 { font-size: 20px; margin: 40px 0 12px; padding-top: 16px; border-top: 1px solid var(--grid); }
.platform h4 { font-size: 16px; margin: 24px 0 8px; }
.platform h5 { font-size: 13px; margin: 16px 0 6px; color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; }
.platform-coming .platform-title .tag { font-size: 13px; vertical-align: 4px; }
.assessment { background: var(--surface); border: 1px dashed var(--axis); border-radius: 10px; padding: 4px 16px 12px; }
.placeholder { color: var(--muted); font-style: italic; }
@media print { h2 { break-after: avoid; } figure, .table-wrap { break-inside: avoid; } }
"""


def render(title, body):
    return f"""<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<style>{CSS}</style>
</head>
<body><main>
{body}
</main></body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Lag uke- eller månedsrapport som HTML.")
    parser.add_argument("--periode", required=True, choices=["uke", "måned", "maned", "mnd"])
    parser.add_argument("--måned", "--maned", dest="month", help="ÅÅÅÅ-MM (standard: forrige måned)")
    parser.add_argument("--uke", dest="week",
                        help="ÅÅÅÅ-Www (standard: forrige uke, på søndager inneværende uke)")
    args = parser.parse_args()

    now = datetime.now(OSLO)
    posts, hist, followers, account = load_all()
    youtube = load_youtube(account)
    DATA_DIR.mkdir(exist_ok=True)

    if args.periode == "uke":
        # Ukentlig gjennomgang skjer på søndager: da er det uken som slutter i dag som gjelder
        week_day = now.date() if now.date().weekday() == 6 else now.date() - timedelta(days=7)
        iso = args.week or "{}-W{:02d}".format(*week_day.isocalendar()[:2])
        title, body = week_report(posts, hist, followers, now, iso, youtube)
        path = DATA_DIR / f"rapport_uke_{iso}.html"
    else:
        ym = args.month or f"{now.date().replace(day=1) - timedelta(days=1):%Y-%m}"
        title, body = month_report(posts, hist, followers, now, ym, youtube)
        path = DATA_DIR / f"rapport_maaned_{ym}.html"

    path.write_text(render(title, body), encoding="utf-8")
    print(f"Skrev {path}")


if __name__ == "__main__":
    try:
        main()
    except db.SupabaseError as e:
        sys.exit(f"Feil fra Supabase: {e}")
