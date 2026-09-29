# NM Insights

AI-drevet analyse av sosiale medier for Nordbø Marketing. Pilotkunde: Veksthuset (Eika-sparebank).
Mål: månedsrapport med funn og konkrete forslag til tester, som kan vises til Veksthuset/Eika og andre kunder.

## Status
- Meta-app "NM Insights" med Instagram API (oppsett med Facebook-innlogging), utviklingsmodus
- Permanent token fra systembrukeren "NM Insights Bot" ligger i .env (META_ACCESS_TOKEN)
- Instagram-konto veksthusene: IG_USER_ID 17841450044968553, graph.facebook.com v26.0
- fetch_instagram.py fungerer: 241 innlegg (nov 2021 – sep 2026), 96 Reels og 145 feed-innlegg
- Innsikt hentes per innlegg: reach, views, saved, shares, total_interactions (+ watch time for Reels)
- Data lagres foreløpig i data/posts.csv og data/posts.json

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

## Arkitektur (pipeline)
Datainnhenter (Python) → Tallanalytiker (pandas, ingen LLM) + Innholdsagent (Claude: konsept, tema, hook, hashtags)
→ Mønsteragent → Strategiagent + Kritiker (avviser funn med for lite datagrunnlag) → Månedsrapport

## Stack
Python, Supabase, GitHub Actions (daglig kjøring), Claude API

## Neste steg
1. Send tokenet i Authorization-header (Bearer) i stedet for URL-parameter
2. Git + privat GitHub-repo "nm-insights"
3. Konsept-kolonne med automatisk merking + concept_overrides.csv for manuell retting
4. Lagring i Supabase i stedet for CSV
5. Tallanalytiker med pandas
6. Agenter og månedsrapport
7. Daglig kjøring med GitHub Actions (token som GitHub Secret)

## Regler
- Aldri skriv ut, logg eller commit innholdet i .env. Tokenet skal aldri stå i URL-er eller feilmeldinger.
- Repoet er privat. data/ og .venv/ skal aldri committes.
- Tidspunkt analyseres i Europe/Oslo.
- Bruk median i tillegg til gjennomsnitt. Enkeltinnlegg med ekstrem rekkevidde (f.eks. VM) skal ikke skjule mønstrene.
- Konsepter i ulike formater (Reels vs. feed) skal ikke sammenlignes direkte på rekkevidde.
  Sammenlign innenfor samme format, eller bruk relative mål som engasjementsrate.
- Rapporter alltid antall innlegg per konsept. Funn basert på under 5–6 innlegg merkes "foreløpig".