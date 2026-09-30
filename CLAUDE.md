# NM Insights

Analyse av sosiale medier for Nordbø Marketing. Pilotkunde: Veksthuset (Eika-sparebank), Instagram-kontoen
«veksthusene». Mål: månedsrapport med funn og konkrete forslag til tester, som kan vises til Veksthuset/Eika
og andre kunder. Adrian (Nordbø Marketing) eier prosjektet.

## Arkitektur
Fase 1 (nå): ingen Claude API og ingen agenter.

fetch_instagram.py (GitHub Actions kl. 07 og 20) → Supabase → analyze.py / report.py (pandas, regelbasert)

- Rapportene lager tall, grafer og automatiske flagg, men ingen tolkning.
- Den kvalitative delen (hooks, tema, vurdering, anbefalinger til produsenten) gjør Adrian manuelt med
  Claude Code, i seksjonen «Vurdering og anbefalinger» i månedsrapporten.
- Fase 2 (når det finnes betalende kunder): agenter med Claude API (innholdsagent, mønsteragent,
  strategiagent + kritiker som avviser funn med for lite datagrunnlag).

## Filer
| Fil | Rolle |
|---|---|
| fetch_instagram.py | Henter fra Meta Graph API, merker konsept, skriver til Supabase + lokal backup data/posts.json/.csv |
| db.py | Tynn PostgREST-klient mot Supabase (select med sidedeling, upsert i biter, get_account) |
| concepts.py | Regelbasert konseptmerking + is_vm. `python concepts.py` merker data/posts.json på nytt lokalt |
| concept_overrides.csv | Manuelle konseptrettelser (`id;concept;dato;first_line;kommentar`), vinner alltid over automatikken |
| analyze.py | Oppsummering av Adrians periode → data/analysis.md. `load_posts()` leser posts_latest og brukes av report.py |
| report.py | Uke- og månedsrapport som én selvstendig HTML-fil med inline SVG-grafer |
| time_tests.csv | Register for tidspunkt-tester (`navn;konsept;format;fra;til;tidsrom`, f.eks. `19-21`), tomt foreløpig |
| demo_report.py | Anonymisert demo av månedsrapporten med «TikTok (planlagt)»-seksjon (eksempeltall) |
| record_demo.py | Playwright-videoopptak av demoen → data/demo_tiktok.mp4 (ikke committet ennå) |
| supabase/schema.sql | Fullt skjema, idempotent. supabase/migrations/ har endringer for eksisterende database |
| .github/workflows/fetch-instagram.yml | Daglig kjøring |

Kommandoer (Windows, Git Bash; sett `PYTHONIOENCODING=utf-8` for æøå i terminalen):
```
.venv/Scripts/python fetch_instagram.py
.venv/Scripts/python analyze.py
.venv/Scripts/python report.py --periode måned [--måned 2026-09]   # standard: forrige måned
.venv/Scripts/python report.py --periode uke [--uke 2026-W39]      # standard: forrige uke, på søndager inneværende
.venv/Scripts/python demo_report.py --måned 2026-09
.venv/Scripts/python record_demo.py [--scopes tiktok_scopes.png]
```
Rapporter skrives til data/ (rapport_maaned_ÅÅÅÅ-MM.html, rapport_uke_ÅÅÅÅ-Www.html). data/ er gitignored.
Playwright og imageio-ffmpeg (for record_demo.py) er installert i .venv, men står ikke i requirements.txt.

## Integrasjoner

### Meta / Instagram Graph API
- Meta-app «NM Insights», Instagram API med Facebook-innlogging, utviklingsmodus.
- Permanent token fra systembrukeren «NM Insights Bot» (META_ACCESS_TOKEN). graph.facebook.com v26.0.
- IG_USER_ID 17841450044968553 (veksthusene). Tokenet sendes i `Authorization: Bearer`, aldri som URL-parameter.
- Innlegg: `/{ig}/media` (id, caption, media_type, media_product_type, timestamp, like_count, comments_count, permalink).
- Innsikt per innlegg: reach, views, saved, shares, total_interactions; Reels også ig_reels_avg_watch_time og
  ig_reels_video_view_total_time (millisekunder). Én ugyldig metric stopper hele kallet, så koden faller
  tilbake til én metric om gangen.
- Konto: `/{ig}?fields=username,followers_count,follows_count,media_count`.
- Nye følgere: `/{ig}/insights?metric=follower_count&period=day`. Gir bare nye følgere per dag (ikke total),
  maks 30 dager bakover. end_time kl. 07:00 UTC = slutten av Metas døgn, så verdien gjelder dagen før.
- Unik rekkevidde for kontoen: `/{ig}/insights?metric=reach&period=day&metric_type=total_value&since&until`.
  Deduplisert over perioden (sept: 42 169 unike mot 59 717 som sum av dager). Maks 30 dager mellom since og
  until, data bare 2 år tilbake. Dekker alt innhold som ble sett i perioden, også eldre innlegg og historier.
  Hentes live av report.py (lagres ikke).

### Supabase
- REST (PostgREST) via db.py. SUPABASE_SECRET_KEY (sb_secret_…) sendes bare i `apikey`-headeren.
- Automatisk eksponering av nye tabeller er slått av i prosjektet: alle rettigheter gis eksplisitt, og bare
  til service_role. RLS er på uten policies. anon/authenticated har ingen tilgang.
- Adrian kjører all SQL selv i SQL Editor. Ikke test med Docker. DDL kan ikke kjøres via REST.
- Tabeller:
  - `accounts`: én rad per kundekonto (Veksthuset = id 1, concepts_start 2026-06-15). Unik (platform, platform_account_id).
  - `posts`: metadata + concept, concept_source (auto/manuell), concept_reason, special_event
    ('VM 2026' der is_vm er true, generisk for andre kunders kampanjer), first_seen_at, last_seen_at.
    Unik (account_id, platform_post_id). Avledede felt (ukedag, time, lengde) lagres ikke.
  - `post_insights`: én rad per innlegg per dag og slot. PK (post_id, snapshot_date, snapshot_slot),
    slot 'morgen'/'kveld' (kjøring fra kl. 14 Oslo = kveld). engagement_rate er generert kolonne
    (total_interactions / reach). raw = {media, insights} fra API-et.
  - `account_insights`: én rad per konto per dag. followers_count, follows_count, media_count,
    new_followers, raw.
  - Visningen `posts_latest` (security_invoker): hvert innlegg med nyeste måling (dato, så fetched_at).
- Oppdateringsstrategi: innlegg yngre enn 30 dager får nye tall hver kjøring; eldre bare hvis de ikke har
  fått tall de siste 7 dagene. Samme dag + slot oppdaterer raden (idempotent).
- Skjemaendringer: skriv migrering i supabase/migrations/ og oppdater schema.sql. Kode som avhenger av
  endringen pushes først etter at Adrian har kjørt SQL-en, ellers feiler de planlagte kjøringene.

### GitHub
- Privat repo AdrianNordbo/NM-insights, branch main. `gh` er ikke installert: Actions-logger kan ikke leses herfra.
- Workflow: cron 05, 06, 18, 19 UTC. Et kontrollsteg regner ut Oslo-timen for utløseren og slipper bare
  gjennom 07 og 20 (håndterer sommer-/vintertid). workflow_dispatch kjører alltid.
- Secrets: META_ACCESS_TOKEN, IG_USER_ID, SUPABASE_URL, SUPABASE_SECRET_KEY.
- data/posts.json finnes ikke i Actions; der er Supabase eneste lager.

### TikTok (planlagt, ikke implementert)
- TikTok API for Business, Accounts API v1.3. Søkte tilganger i portalen: TikTok accounts →
  «Get account user basic info», «Get account user insights», «Get account media».
- Accounts API Access Application Form kreves (fra 20.03.2026). Søknaden trenger skjermopptak: se
  demo_report.py og record_demo.py. Adrian legger portal-skjermbildet i prosjektmappen som tiktok_scopes.png.
- `/business/get/`: user.info.* (display_name, username, followers_count, videos_count …) og user.insights
  (daglige video_views, likes, comments, shares, profile_views, followers_count; daily_new_followers o.l.
  bare for Business Accounts). Maks 60 dager bakover, 24–48 t forsinkelse, datoer i UTC.
- `/business/video/list/`: video.list (item_id, create_time, caption, likes, comments, shares, favorites,
  reach, video_views, video_duration …). Seertid, full_video_watched_rate, new_followers per video m.m.
  krever video.insights, som IKKE er søkt om. Postdata oppdateres ikke etter 365 dager. Maks 20 per side.
- Demoen viser bare tall som er støttet av disse feltene, med en «Datagrunnlag»-tabell.

## Rapporter
Felles: innlegg yngre enn 7 dager utelates fra sammenligninger av endelige tall. Grupper under 6 innlegg
merkes «foreløpig». Reels og feed sammenlignes aldri på rekkevidde; konsepter sammenlignes innenfor format.
Grafer er inline SVG (ingen eksterne avhengigheter), fargetokens med lys/mørk modus.

Månedsrapport:
- Nøkkeltall (innlegg, unike kontoer nådd, median engasjementsrate, nye følgere) med endring fra forrige måned.
- «Totalt for måneden»: summer for alle innlegg publisert i måneden (visninger, likes, kommentarer,
  lagringer, delinger, totale interaksjoner) + nye følgere, med endring og per innlegg. Rekkevidde vises som
  «Unike kontoer nådd» fra Meta; hvis API-et ikke svarer, som sum per innlegg merket «samme person kan telles
  flere ganger». 31-dagers måneder måles over dag 1–30.
- Per format og per konsept (median/snitt), med «uten VM»-rader når måneden har VM-innhold.
- Beste/svakeste 3 per format etter rekkevidde (alle rangert hvis under 6 innlegg).
- Flagg: foreløpig, endring over ±25 %, konsepter uten nye innlegg, uavsluttet måned, for lite følgerdata
  (sammenligning krever ≥ 90 % av dagene).
- Tom seksjon «Vurdering og anbefalinger» (Vurdering, Beslutninger om konsepter, Til produsenten,
  Planlegging og tester) som fylles ut manuelt.

Ukesrapport (kort, ingen konseptbeslutninger):
- Ukens innlegg mot konseptets nivå på samme alder: rekkevidde ca. 24 t (vindu 12–36 t) og 48 t (36–60 t)
  fra post_insights. Nivået krever ≥ 6 tidligere innlegg i konseptet med måling; ellers står det at
  historikken mangler. Tydelig avvik = over ±50 %.
- Tidspunkt-tester fra time_tests.csv (test mot samme konsept/format på andre tidspunkt), følgervekst per dag.

## Veksthuset: kontekst
- Adrian tok over kontoen 15.06.2026 (første publiserte video). «Adrians periode» = fra denne datoen.
- Konsepter:
  - Folka Først: intervjuer om arbeidsrelevante temaer (podkast-format), avsluttet uke 39 2026
  - Sitcom: korte humoristiske episoder fra kontoret, inspirert av The Office (publiseres tirsdager)
  - Uten kompetanse: golf/turn o.l., erstattet av På Gata fra uke 39 2026 (publisert torsdager)
  - På Gata: gateintervjuer med ubehagelige/morsomme spørsmål (#PåGata)
  - CTF (Cut the fluff): relevante nyheter som feed-innlegg, avsluttet (siste innlegg 08.09.2026)
  - Bankinfo: Veksthusets egne informasjons- og reklameinnlegg (ikke et innholdskonsept)
  - Annet/aktualitet: alt utenfor konseptene, i praksis VM-Reels juni–juli 2026
  - Før konsepter: alle innlegg før 15.06.2026. Ukjent: ingen regel traff (ingen per 30.09.2026)
- Konseptene har faste publiseringsdager, så ukedagseffekter for Reels er i praksis konsepteffekter.
- VM-innholdet (juni–juli 2026, 9 innlegg) har høyest rekkevidde av alle innlegg. is_vm/special_event
  markerer det på tvers av konsept. Rapporter Adrians periode med og uten VM, og mot samme periode i 2025
  (som bare har 3 feed-innlegg og derfor ikke gir sammenlignbare tall).
- Ingen innlegg er boostet. All rekkevidde er organisk.
- Roller: Adrian planlegger og publiserer (tidspunkt, konseptmiks, frekvens). Innholdet produseres av en
  annen, så anbefalinger om innhold må formuleres slik at de kan sendes videre til produsenten.
- Produksjonstid per konsept er ukjent og skal ikke brukes i analysen.

## Konseptmerking (concepts.py)
- Regler i rekkefølge, første treff vinner: På Gata → Sitcom → Uten kompetanse → CTF (bare feed:
  #veksthuset, #cutthefluff, nyhets-hashtags) → Folka Først (podkast-hashtags, gjestenavn, «snakker om») →
  Bankinfo («vi skaper mer sammen», «ta kontakt», «sponsorturnering» …) → Annet (VM-hashtags) →
  Folka Først svakt signal (arbeidslivs-hashtags, bare Reels).
- De 15 innleggene fra det svake signalet og de to ukjente (28.06 og 29.06) er bekreftet av Adrian og låst
  i concept_overrides.csv (17 rader, alle Folka Først).
- Endringer i merkingen når Supabase ved neste kjøring av fetch_instagram.py.

## Arbeidsflyt
- Ukentlig gjennomgang hver søndag (ukesrapport): justeringer av tidspunkt, rekkefølge og tester.
- Månedlig rapport: beslutninger om konsepter og rapportering til Veksthuset.
- Tidspunkt-tester registreres i time_tests.csv og følges opp i ukesrapporten.

## Kjente problemer og begrensninger
- Den planlagte kjøringen i GitHub Actions er ikke verifisert ennå. GitHub kan forsinke cron, og pauser
  planlagte workflows etter 60 dager uten commits.
- post_insights-historikken startet 29.09.2026. Sammenligning på samme alder i ukesrapporten blir først mulig
  når konseptene har ≥ 6 målte innlegg (Sitcom med ett innlegg i uken: ca. 6 uker). Radene fra 29.09 er merket
  'morgen' selv om de ble hentet midt på dagen.
- account_insights 30.08–28.09.2026 har bare new_followers (fra Metas historikk); followers_count lagres fra
  29.09.2026. August har følgerdata for bare 2 av 31 dager.
- Metas døgn for følgere og unik rekkevidde følger Stillehavstid, ikke Oslo-tid.
- Meta rapporterer media_count 237, men media-listen gir 241 innlegg (ikke undersøkt).
- Unik rekkevidde per måned lagres ikke, og er bare tilgjengelig 2 år bakover.
- db.select overstyrer en eventuell «limit» i params med sin egen sidedeling.
- Rapportene er på norsk; bare videoens tekster er på engelsk.

## Neste steg
1. Verifisere at kjøringene kl. 07 og 20 i GitHub Actions går (Adrian må lese loggene i GitHub)
2. Første ukentlige gjennomgang og månedsrapport med vurdering fylt ut
3. TikTok: fullføre API-søknaden (demo-video), deretter integrasjon mot /business/get/ og /business/video/list/
4. Vurdere å lagre unik rekkevidde per måned i Supabase
5. Fase 2 (agenter med Claude API) når det finnes betalende kunder

## Regler
- Aldri skriv ut, logg eller commit innholdet i .env. Tokens og nøkler skal aldri stå i URL-er eller
  feilmeldinger. Før hver commit: søk i stagede filer etter META_ACCESS_TOKEN- og SUPABASE_SECRET_KEY-verdiene.
- Repoet er privat. data/, .venv/ og .env skal aldri committes. Commit og push bare når Adrian ber om det.
- Commit-meldinger på engelsk, med Co-Authored-By-linje.
- Tidspunkt analyseres i Europe/Oslo.
- Bruk median i tillegg til gjennomsnitt. Enkeltinnlegg med ekstrem rekkevidde (f.eks. VM) skal ikke skjule mønstrene.
- Konsepter i ulike formater (Reels vs. feed) skal ikke sammenlignes direkte på rekkevidde.
  Sammenlign innenfor samme format, eller bruk relative mål som engasjementsrate.
- Rapporter alltid antall innlegg per konsept. Funn basert på under 6 innlegg merkes «foreløpig».
- Innlegg yngre enn 7 dager utelates fra sammenligninger av endelige tall.
- Rekkevidde summert over innlegg er ikke unike personer, og skal merkes slik hvis den vises.
- Demo og materiale til tredjeparter skal anonymiseres (kundenavn, captions, lenker), og eksempeltall
  skal merkes tydelig på hvert element.
