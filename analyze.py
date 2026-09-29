"""
NM Insights - tallanalytiker (pandas, ingen LLM).

Leser siste tall per innlegg fra Supabase (visningen posts_latest) og skriver
en oppsummering av Adrians periode (fra 15.06.2026) til data/analysis.md.

Kjør:  python analyze.py
"""
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

import db
from concepts import CONCEPTS_START, VM_EVENT

DATA_DIR = Path("data")
OSLO = ZoneInfo("Europe/Oslo")

MIN_AGE_DAYS = 7      # yngre innlegg samler fortsatt rekkevidde
MIN_POSTS = 6         # grupper med færre innlegg merkes "foreløpig"
COMPARE_2025 = ("2025-06-15", "2025-09-29")

WEEKDAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"]
HOUR_BINS = [0, 13, 16, 19, 21, 24]
HOUR_LABELS = ["før 13", "13–15", "16–18", "19–20", "21–23"]
FORMATS = {"REELS": "Reels", "FEED": "Feed"}
NUMERIC_COLUMNS = ["reach", "views", "saved", "shares", "engagement_rate", "avg_watch_time_ms"]


def load_posts():
    account = db.get_account("instagram", os.getenv("IG_USER_ID"))
    rows = db.select("posts_latest", {
        "select": "id,published_at,media_product_type,concept,special_event,snapshot_date,"
                  + ",".join(NUMERIC_COLUMNS),
        "account_id": f"eq.{account['id']}",
        "order": "id",
    })
    df = pd.DataFrame(rows)
    df[NUMERIC_COLUMNS] = df[NUMERIC_COLUMNS].apply(pd.to_numeric)
    df["time"] = pd.to_datetime(df["published_at"], utc=True).dt.tz_convert(OSLO)
    df["date"] = df["time"].dt.strftime("%Y-%m-%d")
    df["hour"] = df["time"].dt.hour
    df["weekday"] = df["time"].dt.weekday.map(lambda i: WEEKDAYS[i])
    df["is_vm"] = df["special_event"].eq(VM_EVENT)
    df["format"] = df["media_product_type"].map(FORMATS).fillna(df["media_product_type"])
    df["watch_time_s"] = df["avg_watch_time_ms"] / 1000
    df["time_slot"] = pd.cut(df["hour"], HOUR_BINS, labels=HOUR_LABELS, right=False)
    return df


def summarize(group):
    """Nøkkeltall for én gruppe innlegg."""
    n = len(group)
    return pd.Series({
        "Innlegg": n,
        "Median reach": group["reach"].median(),
        "Snitt reach": group["reach"].mean(),
        "Median views": group["views"].median(),
        "Snitt views": group["views"].mean(),
        "Median eng.": group["engagement_rate"].median(),
        "Snitt eng.": group["engagement_rate"].mean(),
        "Median lagret": group["saved"].median(),
        "Snitt lagret": group["saved"].mean(),
        "Median delt": group["shares"].median(),
        "Snitt delt": group["shares"].mean(),
        "Snitt watch time": group["watch_time_s"].mean(),  # bare Reels har watch time
        "Merknad": "foreløpig" if n < MIN_POSTS else "",
    })


def summarize_timing(group):
    n = len(group)
    return pd.Series({
        "Innlegg": n,
        "Median eng.": group["engagement_rate"].median(),
        "Snitt eng.": group["engagement_rate"].mean(),
        "Median reach": group["reach"].median(),
        "Merknad": "foreløpig" if n < MIN_POSTS else "",
    })


# --- Formatering -------------------------------------------------------------

def fmt(value, column):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "–"
    if isinstance(value, str):
        return value
    if "eng." in column:
        return f"{value * 100:.2f} %"
    if "watch time" in column:
        return f"{value:.1f} s"
    if column == "Innlegg":
        return str(int(value))
    return f"{value:,.0f}".replace(",", " ")


INDEX_LABELS = {"concept": "Konsept", "format": "Format", "weekday": "Ukedag", "time_slot": "Tidspunkt"}
TEXT_COLUMNS = {"Utvalg", "Merknad", *INDEX_LABELS.values()}


def md_table(df, index_name="Utvalg"):
    """Markdown-tabell uten ekstra avhengigheter (tabulate)."""
    df = df.reset_index().rename(columns={"index": index_name, **INDEX_LABELS})
    cols = list(df.columns)
    lines = [
        "| " + " | ".join(cols) + " |",
        "|" + "|".join("---" if c in TEXT_COLUMNS else "---:" for c in cols) + "|",
    ]
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(fmt(row[c], c) for c in cols) + " |")
    return "\n".join(lines)


# --- Analyse -----------------------------------------------------------------

def by_group(df, keys, func=summarize):
    out = df.groupby(keys, observed=True).apply(func, include_groups=False)
    return out.sort_values("Innlegg", ascending=False) if func is summarize else out


def build_report(df, now):
    cutoff = now - timedelta(days=MIN_AGE_DAYS)
    start = CONCEPTS_START
    period_all = df[df["date"] >= start]
    too_young = period_all[period_all["time"] > cutoff]
    period = period_all[period_all["time"] <= cutoff]
    no_vm = period[~period["is_vm"]]
    y25 = df[(df["date"] >= COMPARE_2025[0]) & (df["date"] <= COMPARE_2025[1])]

    out = []
    w = out.append
    w("# NM Insights – tallanalyse Veksthuset\n")
    w(f"Generert {now:%d.%m.%Y %H:%M} (Europe/Oslo). Automatisk generert av analyze.py, ingen LLM.\n")
    w(f"- **Kilde:** Supabase, siste øyeblikksbilde per innlegg (posts_latest). "
      f"Nyeste tall: {df['snapshot_date'].max()}, eldste: {df['snapshot_date'].min()}")
    w(f"- **Periode:** {pd.Timestamp(start):%d.%m.%Y} – {cutoff:%d.%m.%Y} "
      f"({len(period)} innlegg: {(period['format'] == 'Reels').sum()} Reels, "
      f"{(period['format'] == 'Feed').sum()} feed)")
    w(f"- **Utelatt:** {len(too_young)} innlegg yngre enn {MIN_AGE_DAYS} dager "
      f"(publisert etter {cutoff:%d.%m.%Y %H:%M}), fordi de fortsatt samler rekkevidde"
      + (": " + ", ".join(f"{r.date} {r.concept}" for r in too_young.itertuples()) if len(too_young) else ""))
    w(f"- Grupper med under {MIN_POSTS} innlegg er merket **foreløpig**.")
    w("- Engasjementsrate = total_interactions / reach. Watch time = snitt for Reels.")
    w("- Reels og feed sammenlignes ikke direkte på rekkevidde; tabellene er derfor delt på format.\n")

    w("## 1. Per konsept\n")
    w(md_table(by_group(period, ["concept", "format"])) + "\n")

    w("## 2. Hele perioden med og uten VM-innhold\n")
    rows = {}
    for label, part in [("Med VM", period), ("Uten VM", no_vm)]:
        for f in ["Reels", "Feed"]:
            rows[(label, f)] = summarize(part[part["format"] == f])
    table = pd.DataFrame(rows).T
    table.index = [f"{a} – {b}" for a, b in table.index]
    w(md_table(table) + "\n")
    vm = period[period["is_vm"]]
    w(f"VM-innhold: {len(vm)} innlegg ({(vm['format'] == 'Reels').sum()} Reels, "
      f"{(vm['format'] == 'Feed').sum()} feed).\n")

    w(f"## 3. Sammenligning med samme periode i 2025 "
      f"({pd.Timestamp(COMPARE_2025[0]):%d.%m}–{pd.Timestamp(COMPARE_2025[1]):%d.%m.%Y})\n")
    rows = {}
    for label, part in [("2025", y25), ("2026", period), ("2026 uten VM", no_vm)]:
        for f in ["Reels", "Feed"]:
            rows[f"{label} – {f}"] = summarize(part[part["format"] == f])
    w(md_table(pd.DataFrame(rows).T) + "\n")
    w(f"2025-perioden har {len(y25)} innlegg totalt.\n")

    w("## 4. Engasjement etter ukedag og tidspunkt\n")
    w("Delt på format, siden feed og Reels publiseres på ulike tider og har ulikt engasjementsnivå. "
      "Uten VM-innhold.\n")
    for f in ["Reels", "Feed"]:
        part = no_vm[no_vm["format"] == f]
        wd = by_group(part, "weekday", summarize_timing)
        wd = wd.reindex([d for d in WEEKDAYS if d in wd.index])
        w(f"### {f} – ukedag\n")
        w(md_table(wd) + "\n")
        # Konseptene har faste publiseringsdager, så ukedag og konsept henger sammen.
        mix = pd.crosstab(part["concept"], part["weekday"])
        mix = mix[[d for d in WEEKDAYS if d in mix.columns]]
        w(f"Konsept per ukedag ({f}). Når ett konsept dominerer en dag, måler ukedags-tallene "
          "i praksis konseptet, ikke dagen:\n")
        w(md_table(mix) + "\n")
        w(f"### {f} – tidspunkt\n")
        w(md_table(by_group(part, "time_slot", summarize_timing)) + "\n")

    return "\n".join(out)


def main():
    df = load_posts()
    now = datetime.now(OSLO)
    report = build_report(df, now)
    path = DATA_DIR / "analysis.md"
    path.write_text(report, encoding="utf-8")
    print(f"Skrev {path}")


if __name__ == "__main__":
    main()
