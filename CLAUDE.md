# NM Insights

AI-drevet analyse av sosiale medier for Nordbø Marketing. Pilotkunde: Veksthuset (Eika-sparebank).
Mål: månedsrapport med funn og konkrete forslag til tester, som kan vises til Veksthuset/Eika og andre kunder.

## Status
- Meta-app "NM Insights" med Instagram API (oppsett med Facebook-innlogging), utviklingsmodus
- Permanent token fra systembrukeren "NM Insights Bot" ligger i .env (META_ACCESS_TOKEN)
- Instagram-konto veksthusene: IG_USER_ID 17841450044968553, graph.facebook.com v26.0
- GitHub: privat repo AdrianNordbo/NM-insights (branch main)
- fetch_instagram.py henter 241 innlegg (nov 2021 – sep 2026), 96 Reels og 145 feed-innlegg,
  og lagrer i Supabase. Tokenet sendes i Authorization-header (Bearer).
  - Innsikt per innlegg: reach, views, likes, comments, saved, shares, total_interactions
    (+ watch time for Reels), med hele API-svaret i raw
  - Oppdatering: innlegg fra siste 30 dager får nye tall hver kjøring, eldre én gang i uken
  - Kontotall hver kjøring: followers_count, follows_count, media_count, og new_followers per dag
    (Meta gir bare nye følgere per dag, maks 30 dager bakover; totalen lagres fra 29.09.2026)
  - data/posts.json og data/posts.csv skrives fortsatt som lokal backup
- Supabase: skjema i supabase/schema.sql (kjøres manuelt i SQL Editor). Tabeller: accounts, posts,
  post_insights (én rad per innlegg per dag), account_insights (én rad per konto per dag),
  visningen posts_latest. RLS på, rettigheter bare til service_role. db.py er REST-klienten.
- Meta rapporterer media_count 237, men media-listen gir 241 innlegg (ikke undersøkt)
- concepts.py merker konsept; concept_overrides.csv har 17 manuelle rettelser (alle Folka Først)
- analyze.py (pandas, ingen LLM) leser posts_latest og skriver data/analysis.md
- GitHub Actions (.github/workflows/fetch-instagram.yml) kjører fetch_instagram.py kl. 07 norsk tid
  hver dag, og kan startes manuelt. Secrets: META_ACCESS_TOKEN, IG_USER_ID, SUPABASE_URL,
  SUPABASE_SECRET_KEY

## Veksthuset: kontekst
- Adrian tok over kontoen 15.06.2026 (første publiserte video). "Adrians periode" = fra denne datoen.
- Konsepter:
  - Folka Først: intervjuer om arbeidsrelevante temaer (podkast-format), avsluttet uke 39 2026
  - Sitcom: korte humoristiske episoder fra kontoret, inspirert av The Office
  - Uten kompetanse: golf/turn o.l., erstattet av På Gata fra uke 39 2026
  - På Gata: gateintervjuer med ubehagelige/morsomme spørsmål (#PåGata)
  - CTF (Cut the fluff): relevante nyheter som feed-innlegg (økonomi, lokalnytt, hendelser),
    avsluttet nylig (siste innlegg 08.09.2026)
  - Bankinfo: Veksthusets egne informasjons- og reklameinnlegg (ikke et innholdskonsept)
  - Annet/aktualitet: alt utenfor konseptene, f.eks. VM-Reels juni–juli 2026
- Merking: concepts.py (automatisk, hashtags + ord i captionen) + concept_overrides.csv (manuell, vinner alltid).
  Innlegg før 15.06.2026 merkes "Før konsepter".
- VM-innholdet (juni–juli 2026) er publisert i Adrians periode og har høyest rekkevidde av alle innlegg.
  Kolonnen is_vm markerer VM-innhold på tvers av konsept (også CTF-innlegg om VM).
  Rapporter Adrians periode både med og uten VM-innhold, og sammenlign med samme periode i 2025.
- Ingen innlegg er boostet. All rekkevidde er organisk.
- Roller: Adrian har ansvar for planlegging og publisering (tidspunkt, konseptmiks, frekvens).
  Innholdet produseres av en annen, så anbefalinger om innhold må formuleres slik at de kan
  sendes videre til produsenten.
- Produksjonstid per konsept er ukjent og skal ikke brukes i analysen.

## Arkitektur
Fase 1 (nå): ingen Claude API og ingen agenter.
Datainnhenter (fetch_instagram.py, daglig i GitHub Actions) → Supabase
→ Tallanalyse (analyze.py, pandas) → Regelbasert rapport (report.py, HTML med grafer)
- Rapporten lager tall, grafer og automatiske flagg, men ingen tolkning.
- Den kvalitative delen (hooks, tema, vurdering og anbefalinger til produsenten) gjør Adrian
  manuelt med Claude Code, i seksjonen «Vurdering og anbefalinger» i rapporten.

Fase 2 (når det finnes betalende kunder): agenter med Claude API
(innholdsagent, mønsteragent, strategiagent + kritiker).

## Arbeidsflyt
- Ukentlig gjennomgang hver søndag (report.py --periode uke): justeringer av tidspunkt,
  rekkefølge og tester. Ukens innlegg sammenlignes med konseptets vanlige nivå på samme alder.
  Ingen konseptbeslutninger i ukesrapporten.
- Månedlig rapport (report.py --periode måned): beslutninger om konsepter og rapportering
  til Veksthuset.
- Tidspunkt-tester registreres i time_tests.csv og følges opp i ukesrapporten.

## Stack
Python, pandas, Supabase, GitHub Actions (daglig kjøring). Claude API først i fase 2.

## Neste steg
Ferdig: Bearer-token, Git/GitHub, konseptmerking, Supabase, tallanalytiker, daglig kjøring
i GitHub Actions, rapportgenerator (report.py).
1. Verifisere at den planlagte kjøringen i GitHub Actions går som den skal
2. Første ukentlige gjennomgang og månedsrapport med vurdering fylt ut
3. Fase 2 (agenter med Claude API) når det finnes betalende kunder

## Regler
- Aldri skriv ut, logg eller commit innholdet i .env. Tokenet skal aldri stå i URL-er eller feilmeldinger.
- Repoet er privat. data/ og .venv/ skal aldri committes.
- Tidspunkt analyseres i Europe/Oslo.
- Bruk median i tillegg til gjennomsnitt. Enkeltinnlegg med ekstrem rekkevidde (f.eks. VM) skal ikke skjule mønstrene.
- Konsepter i ulike formater (Reels vs. feed) skal ikke sammenlignes direkte på rekkevidde.
  Sammenlign innenfor samme format, eller bruk relative mål som engasjementsrate.
- Rapporter alltid antall innlegg per konsept. Funn basert på under 5–6 innlegg merkes "foreløpig".