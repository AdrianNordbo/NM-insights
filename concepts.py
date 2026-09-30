"""
NM Insights - konseptmerking av Veksthuset-innlegg.

Automatisk merking ut fra hashtags og ord i captionen, med manuelle
rettelser fra concept_overrides.csv (overstyrer alltid automatikken).
Setter også is_vm, slik at VM-innhold kan filtreres ut uavhengig av konsept.

Kjør:  python concepts.py   (merker data/posts.json på nytt uten å hente fra Meta)
"""
import csv
import json
from pathlib import Path

OVERRIDES_FILE = Path("concept_overrides.csv")

FOLKA_FORST = "Folka Først"
SITCOM = "Sitcom"
UTEN_KOMPETANSE = "Uten kompetanse"
PA_GATA = "På Gata"
CTF = "CTF"
BANKINFO = "Bankinfo"
ANNET = "Annet/aktualitet"
UKJENT = "Ukjent"
FOR_KONSEPTER = "Før konsepter"
CONCEPTS = [
    FOLKA_FORST, SITCOM, UTEN_KOMPETANSE, PA_GATA, CTF, BANKINFO, ANNET,
    UKJENT, FOR_KONSEPTER,
]

# Adrian tok over kontoen og startet konseptene denne dagen (Oslo-tid).
CONCEPTS_START = "2026-06-15"

# special_event-verdien i Supabase for innlegg med is_vm = true
VM_EVENT = "VM 2026"

VM_HASHTAGS = {
    "vm", "fotballvm", "vm2026", "2026worldcup", "fotballfeber", "haaland",
    "vmbilletter", "vmdrama", "norwayvsfrance",
}

# Regler sjekkes i rekkefølge; første treff vinner. Hashtags sammenlignes
# uten # og i små bokstaver, fraser søkes etter i hele captionen.
# media_type begrenser regelen til REELS eller FEED.
RULES = [
    (PA_GATA, {
        "hashtags": {"pågata"},
        "phrases": ["på gata"],
    }),
    (SITCOM, {
        "hashtags": {"sitcom", "theoffice", "norskserie"},
        "phrases": [],
    }),
    (UTEN_KOMPETANSE, {
        "hashtags": {
            "førstegang", "firsttime", "prøvernyeting", "måprøves",
            "klatring", "buldring", "climbing", "turn", "håndstående",
            "golfchallange", "golftips", "beginnergolf", "norskgolf", "golfswing",
        },
        "phrases": ["for første gang"],
    }),
    # Cut the fluff: nyhetsinnlegg i feeden. Alle har #Veksthuset som
    # første hashtag, pluss nyhets-hashtags.
    (CTF, {
        "hashtags": {
            "cutthefluff", "veksthuset",
            "norskøkonomi", "lokalnytt", "geopolitikk", "oljepris",
        },
        "phrases": [],
        "media_type": "FEED",
    }),
    (FOLKA_FORST, {
        "hashtags": {
            "podkast", "norskpodkast", "norskepodkaster", "podcastclip", "podcasting",
        },
        # Gjester og formuleringer fra podkast-klippene
        "phrases": [
            "i denne episoden", "fredrik frøshaug", "fredrik forteller",
            "snakker om", "anette", "emil", "mayrita", "maryita",
        ],
    }),
    # Veksthusets egne informasjons- og reklameinnlegg
    (BANKINFO, {
        "hashtags": set(),
        "phrases": [
            "vi skaper mer sammen", "på veksthuset kan", "ta kontakt",
            "sponsorturnering", "team veksthuset",
        ],
    }),
    (ANNET, {
        "hashtags": VM_HASHTAGS,
        "phrases": [],
    }),
    # Tidlige Folka Først-klipp (juni–juli 2026) manglet podkast-hashtags,
    # men har arbeidslivs-hashtags. Svakere signal, derfor sjekket sist
    # og bare for Reels.
    (FOLKA_FORST, {
        "hashtags": {
            "grunder", "startup", "jobbsøknad", "jobbintervju", "rekruttering",
            "arbeidsliv", "arbeidslivet", "jobbmulighet", "leder", "kvinner",
        },
        "phrases": [],
        "media_type": "REELS",
        "weak": True,
    }),
]


def _hashtags(post):
    return {h.lower() for h in (post.get("hashtags") or "").split()}


def is_vm(post):
    return bool(_hashtags(post) & VM_HASHTAGS)


def classify(post, platform="instagram"):
    """Returnerer (konsept, begrunnelse) for ett innlegg.

    På YouTube (platform="youtube") er alt video: regler som bare gjelder feed
    (CTF) hoppes over, og regler som på Instagram bare gjelder Reels, gjelder alle."""
    if post["timestamp_oslo"][:10] < CONCEPTS_START:
        return FOR_KONSEPTER, f"publisert før {CONCEPTS_START}"

    caption = (post.get("caption") or "").lower()
    hashtags = _hashtags(post)

    for concept, rule in RULES:
        media_type = rule.get("media_type")
        if platform == "youtube":
            if media_type == "FEED":
                continue
        elif media_type and media_type != post.get("media_product_type"):
            continue
        prefix = "svakt signal: " if rule.get("weak") else ""
        tag_hits = sorted(hashtags & rule["hashtags"])
        if tag_hits:
            return concept, prefix + "#" + " #".join(tag_hits)
        phrase_hits = [p for p in rule["phrases"] if p in caption]
        if phrase_hits:
            return concept, prefix + "tekst: " + ", ".join(f'"{p}"' for p in phrase_hits)
    return UKJENT, ""


def load_overrides(path=OVERRIDES_FILE):
    """Leser concept_overrides.csv. Rader med tomt konsept ignoreres."""
    if not path.exists():
        return {}
    valid = {c.lower(): c for c in CONCEPTS}
    overrides = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            post_id = (row.get("id") or "").strip()
            concept = (row.get("concept") or "").strip()
            if not post_id or not concept:
                continue
            if concept.lower() not in valid:
                print(f"Advarsel: ukjent konsept '{concept}' for {post_id} i {path}, hoppet over. "
                      f"Gyldige: {', '.join(CONCEPTS)}")
                continue
            overrides[post_id] = valid[concept.lower()]
    return overrides


def apply_concepts(posts, overrides=None, platform="instagram"):
    """Setter concept, concept_source, concept_reason og is_vm på hvert innlegg.
    concept_overrides.csv gjelder alle plattformer (ID-ene overlapper ikke)."""
    if overrides is None:
        overrides = load_overrides()
    for post in posts:
        post["is_vm"] = is_vm(post)
        if post["id"] in overrides:
            post["concept"] = overrides[post["id"]]
            post["concept_source"] = "manuell"
            post["concept_reason"] = str(OVERRIDES_FILE)
        else:
            post["concept"], post["concept_reason"] = classify(post, platform)
            post["concept_source"] = "auto"
    return posts


if __name__ == "__main__":
    from fetch_instagram import DATA_DIR, save

    with open(DATA_DIR / "posts.json", encoding="utf-8") as f:
        posts = json.load(f)
    apply_concepts(posts)
    save(posts)
    print(f"Merket {len(posts)} innlegg på nytt i {DATA_DIR}/posts.csv og posts.json")
