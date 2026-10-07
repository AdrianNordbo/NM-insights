# NM Insights

Analyse av sosiale medier for Nordbø Marketing. Pilotkunde: Veksthuset (Eika-sparebank), Instagram-kontoen
«veksthusene». Mål: månedsrapport med funn og konkrete forslag til tester, som kan vises til Veksthuset/Eika
og andre kunder. Adrian (Nordbø Marketing) eier prosjektet.

## Arkitektur
Fase 1 (nå): ingen Claude API og ingen agenter.

fetch_instagram.py + fetch_youtube.py (GitHub Actions kl. 07 og 20) → Supabase
→ analyze.py / report.py (pandas, regelbasert). Rapportene har egne seksjoner for Instagram og YouTube (Shorts),
og en plassholder for TikTok («kommer»).

- Rapportene lager tall, grafer og automatiske flagg, men ingen tolkning.
- Den kvalitative delen (hooks, tema, vurdering, anbefalinger til produsenten) gjør Adrian manuelt med
  Claude Code, i seksjonen «Vurdering og anbefalinger» i månedsrapporten.
- Fase 2 (når det finnes betalende kunder): agenter med Claude API (innholdsagent, mønsteragent,
  strategiagent + kritiker som avviser funn med for lite datagrunnlag).

## Filer
| Fil | Rolle |
|---|---|
| fetch_instagram.py | Henter fra Meta Graph API, merker konsept, skriver til Supabase + lokal backup data/posts.json/.csv |
| fetch_youtube.py | Henter fra YouTube Data API + Analytics API, merker konsept, skriver til Supabase + data/youtube_videos.json. `--backfill` = full daglig historikk |
| fetch_daily.py | Daglig aktivitet per konto og format → account_daily (Instagram + YouTube). Siste 7 døgn hver kjøring; `--backfill` = Instagram 730 døgn, YouTube fra 04.06.2026; `--only instagram\|youtube`; `--dry-run` uten Supabase |
| youtube_auth.py | Engangs OAuth-innlogging (kanaleier), lagrer secrets/youtube_token.json og skriver YOUTUBE_* til .env |
| retry.py | Felles retry (2, 5 og 10 s ved forbigående feil) og `Failures` (enkeltkall hoppes over og logges; rød kjøring bare ved > 3 feilede kall eller ingenting lagret). Brukes av fetch_instagram/youtube/daily |
| tests/ | `python -m unittest` (test_retry.py: retry og feilklassifisering, uten nettverk) |
| db.py | Tynn PostgREST-klient mot Supabase (select med sidedeling, upsert i biter, get_account) |
| concepts.py | Regelbasert konseptmerking + is_vm, med `platform`-parameter (instagram/youtube). `python concepts.py` merker data/posts.json på nytt lokalt |
| concept_overrides.csv | Manuelle konseptrettelser (`id;concept;dato;first_line;kommentar`), vinner alltid over automatikken. Gjelder begge plattformer (ID-ene overlapper ikke) |
| analyze.py | Oppsummering av Adrians periode → data/analysis.md. `load_posts()` leser posts_latest og brukes av report.py |
| report.py | Uke- og månedsrapport som én selvstendig HTML-fil med inline SVG-grafer |
| time_tests.csv | Register for tidspunkt-tester (`navn;konsept;format;fra;til;tidsrom`, f.eks. `19-21`), tomt foreløpig |
| demo_report.py | Anonymisert demo av månedsrapporten (Instagram og YouTube med ekte tall, titler/captions/lenker skjult) der «TikTok kommer» byttes ut med «TikTok (planlagt)» med eksempeltall |
| record_demo.py | Playwright-videoopptak av demoen → data/demo_tiktok.mp4 (ikke committet ennå) |
| supabase/schema.sql | Fullt skjema, idempotent. supabase/migrations/ har endringer for eksisterende database |
| supabase/checks/ | Kontrollspørringer for SQL Editor: dashboard_access.sql (rettigheter, blokk A–G) og dashboard_data.sql (tall i viewene) |
| .github/workflows/fetch-instagram.yml | Daglig kjøring av Instagram og YouTube (egne jobber) |
| web/ | Dashboardet (Next.js på Vercel), se «Dashboard (web/)» |
| secrets/ | youtube_client_secret.json (OAuth-klient) og youtube_token.json. Gitignored, skal aldri committes |

Kommandoer (Windows, Git Bash; sett `PYTHONIOENCODING=utf-8` for æøå i terminalen):
```
.venv/Scripts/python fetch_instagram.py
.venv/Scripts/python fetch_youtube.py [--backfill]
.venv/Scripts/python -m unittest -v                              # Python-tester (retry)
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

### YouTube (Data API v3 + Analytics API v2)
- Google Cloud-prosjekt «NM Insights» (Adrians konto). OAuth-app External, In production (uverifisert),
  klienttype Desktop. Kanalen eies av veksthuset.sosial@gmail.com. Kanal-ID UChv7DsnM326j78XEZBWyTPg,
  opprettet 04.06.2026, videoer fra 15.06.2026.
- Scopes kun youtube.readonly og yt-analytics.readonly. Refresh token fra youtube_auth.py (access_type=offline,
  prompt=consent). fetch_youtube.py fornyer access token i minnet; tokens og Authorization-headere lagres
  aldri i raw, og koden sjekker det før lagring.
- Data API (sanntid): uploads-spillelisten → videos.list (tittel, beskrivelse, publishedAt, duration,
  viewCount, likeCount, commentCount). tags er alltid tom, favoriteCount alltid 0.
- Analytics (kumulativt, 2–3 dagers forsinkelse): én `dimensions=video`-rapport for views, engagedViews,
  estimatedMinutesWatched, averageViewDuration, averageViewPercentage. likes/comments/shares/subscribers*
  støttes ikke i den listen, bare per video (`filters=video==ID`). Format fra `creatorContentType`
  (to listekall: shorts og videoOnDemand).
- Analytics gir nuller (ikke tomt) for videoer den ikke har behandlet ennå: per-video-tall lagres derfor
  bare for videoer som finnes i video-rapporten, ellers null.
- Analytics-døgn følger Stillehavstid (America/Los_Angeles).

### Supabase
- REST (PostgREST) via db.py. SUPABASE_SECRET_KEY (sb_secret_…) sendes bare i `apikey`-headeren.
- Automatisk eksponering av nye tabeller er slått av i prosjektet: alle rettigheter gis eksplisitt, og bare
  til service_role. RLS er på uten policies. anon/authenticated har ingen tilgang.
- Adrian kjører all SQL selv i SQL Editor. Ikke test med Docker. DDL kan ikke kjøres via REST.
- Tabeller:
  - `accounts`: én rad per kundekonto og plattform (Veksthuset: id 1 = instagram, id 2 = youtube; concepts_start
    2026-06-15). Unik (platform, platform_account_id). Plattformer: instagram, facebook, tiktok, linkedin, youtube.
  - `posts`: metadata + concept, concept_source (auto/manuell), concept_reason, special_event
    ('VM 2026' der is_vm er true, generisk for andre kunders kampanjer), first_seen_at, last_seen_at.
    Unik (account_id, platform_post_id). Avledede felt (ukedag, time, lengde) lagres ikke.
  - `post_insights`: én rad per innlegg per dag og slot. PK (post_id, snapshot_date, snapshot_slot),
    slot 'morgen'/'kveld' (kjøring fra kl. 14 Oslo = kveld). engagement_rate er generert kolonne
    (total_interactions / reach). raw = {media, insights} fra API-et.
  - `account_insights`: én rad per konto per dag. followers_count, follows_count, media_count,
    new_followers, raw.
  - Visningen `posts_latest` (security_invoker): hvert innlegg med nyeste måling (dato, så fetched_at).
  - `youtube_videos`: én rad per video. format 'SHORTS'/'VIDEO' fra creatorContentType, format_source
    'analytics' eller 'varighet' (foreløpig ≤ 180 s til Analytics har klassifisert), konsept, special_event.
  - `youtube_video_insights`: én rad per video per dag og slot. views/likes/comments = Data API sanntid
    (hovedtall). a_views, engaged_views (sekundær), estimated_minutes_watched, average_view_duration_s,
    average_view_percentage = Analytics kumulativt til og med analytics_end_date. shares/subscribers_* fra
    per-video-kall; null = ikke hentet i den kjøringen. raw = {video, analytics, per_video}.
  - `youtube_video_daily`: Analytics per video per Stillehavsdøgn (tall per døgn, ikke kumulative).
  - Visningen `youtube_videos_latest`: nyeste måling per video; shares/abonnenter fra nyeste måling der de
    ble hentet (per_video_end_date).
  - `posts_latest` og `youtube_videos_latest` MÅ ha `security_invoker = false` (satt i
    2026-09-30_latest_views_owner_rights.sql). Et view med security_invoker = true sjekkes som brukeren
    som spør, også når det leses gjennom et annet view, og da får authenticated «permission denied» via
    dashboard-viewene. Eldre migreringer (2026-09-29_snapshot_slot.sql, 2026-09-30_youtube.sql) setter
    true; kjøres de på nytt, må owner_rights-migreringen kjøres etterpå.
  - YouTube-kanalen bruker `account_insights` (account_id 2): followers_count = abonnenter,
    media_count = videoer, new_followers = subscribersGained per Stillehavsdøgn.
  - `accounts.takeover_date`: når Nordbø Marketing tok over (Veksthuset 2026-06-15), markering i grafene.
  - `account_daily` (2026-10-01_account_daily.sql): én rad per konto per Stillehavsdøgn per format med
    views, likes, comments, shares, saves (null for YouTube), interactions og raw. Hele kontoen, også eldre
    innlegg. PK (account_id, activity_date, format).
    - Instagram fra `/{ig}/insights?metric_type=total_value&breakdown=media_product_type`: ALL, REELS (REEL),
      FEED (POST + CAROUSEL_CONTAINER + CAROUSEL_ITEM; karuseller er en egen type hos Meta), STORY, AD, OTHER.
      interactions = Metas total_interactions (kan være litt høyere enn summen, Meta teller også f.eks. svar).
      **Regel for since/until:** Meta tar med hvert døgn der midnatt (Stillehavstid) ligger i [since, until],
      grensen inkludert. Ett døgn hentes derfor med since = døgnets midnatt og until = since + 86399
      (23:59:59), ikke neste midnatt. Med until = neste midnatt fikk hvert kall to døgn (dette døgnet + neste),
      så account_daily for Instagram var ca. 1,9 × for høy fra backfillen 01.10 til rettelsen 05.10.2026.
      Rettet og backfillet 05.10.2026; kontrollert mot eksport fra Meta Insikt (se «Kjente problemer»).
      Mangler et format i svaret, lagres 0, så en ny henting alltid overskriver hele døgnet.
      Metas egne tall i Insikt tar med annonsevisninger (AD) og er derfor ca. 1 % høyere enn dashboardet.
    - YouTube fra Analytics `dimensions=day,creatorContentType` (+ `day` for ALL): ALL, SHORTS, VIDEO, LIVE,
      OTHER. interactions = likes + comments + shares.
- Oppdateringsstrategi: innlegg/videoer yngre enn 30 dager får nye tall hver kjøring; eldre bare hvis de ikke
  har fått tall de siste 7 dagene. Samme dag + slot oppdaterer raden (idempotent).
- YouTube i tillegg: per-video Analytics (shares, abonnenter) for videoer yngre enn 30 dager hver kjøring og
  alle én gang i uken. youtube_video_daily hentes på nytt fra publisering for videoer yngre enn 30 dager.
  Backfill (`fetch_youtube.py --backfill`) er kjørt 30.09.2026: daglig historikk fra 15.06 for alle videoer og
  nye abonnenter per døgn fra 04.06.
- Schema `dashboard` (datalag for dashboardet, 2026-09-30_dashboard.sql):
  - `dashboard.content_latest`: én rad per innlegg/video på tvers av plattformer (platform, account_id,
    content_id, published_at i Oslo-tid, format, concept, special_event, views, likes, comments, age_days,
    is_mature ≥ 7 dager), title, permalink, fetched_at og `shares` (2026-10-06_content_latest_shares.sql,
    bakerst): Instagram fra posts_latest, YouTube fra per-video-Analytics, null der tallet mangler.
    Instagram fra posts_latest (REELS/FEED); YouTube fra youtube_videos_latest med Data API-tall, bare SHORTS.
    Ikke youtube_video_daily.
  - `dashboard.concept_summary`: median views/likes/comments per plattform + konto + format + konsept +
    special_event, bare modne innlegg, med posts og preliminary (< 6). VM får egne rader.
    `median_engagement_per_view` = median av (likes + comments) / views per innlegg
    (2026-09-30_concept_engagement.sql). Bare sammenlignbar innenfor samme plattform og format, og ikke
    samme definisjon som engasjementsraten i Instagram-rapporten (total_interactions / reach).
  - `dashboard.platform_summary`: per plattform + konto + format + periode (uke/måned, fra første innlegg
    til i dag): published, mature_posts, median_views (modne), new_followers, days_with_follower_data,
    followers_end (hele kontoen, likt for alle formater), period_complete og prev_* for forrige periode.
    Per format fordi Reels og feed ikke skal blandes i en median.
  - `dashboard.daily_activity`: account_daily per plattform + konto + døgn + format (ALL, REELS, FEED,
    STORY, SHORTS, VIDEO; AD og OTHER holdes utenfor), med `data_through` (siste døgn med data for kontoen;
    YouTube 2–3 døgn bak) og `takeover_date`.
  - Ingen engasjementsrate på tvers av plattformer. Eneste engasjementsmål er median_engagement_per_view
    i concept_summary, som er per plattform + format.
  - Schemaet er lagt til under «Exposed schemas» (30.09.2026) og leses over REST med
    `Accept-Profile: dashboard`. Tallene er verifisert mot en uavhengig beregning (ingen avvik).
- Rettighetsmodell:
  - Rådata (tabeller, views, sekvenser, funksjoner i public): ingen rettigheter for anon/authenticated.
    Standardrettigheter for nye objekter i public er strammet inn for eierrollene (også global
    EXECUTE-til-PUBLIC på nye funksjoner for eierrollen). En ny funksjon som authenticated skal bruke,
    trenger derfor eksplisitt grant.
  - `authenticated` har bare USAGE på schema dashboard og SELECT på de fire viewene. anon har ingenting.
  - Dashboard-viewene og «latest»-viewene kjører med eierens rettigheter (security_invoker = false). Det
    er det som lar authenticated lese sammenstilte tall uten tilgang til rådata. Supabases security
    advisor flagger dem som «security definer views»; det er forventet.
  - Alle innloggede brukere ser alle kunders data i dashboard-viewene. Åpen registrering i Supabase Auth
    er slått av (30.09.2026). Før neste kunde trengs filtrering per bruker/kunde i viewene.
  - Verifisert 30.09.2026 med supabase/checks/dashboard_access.sql (blokk A–G), og 01.10.2026 etter
    account_daily-migreringen (A, B, C, D2, G).
- Skjemaendringer: skriv migrering i supabase/migrations/ og oppdater schema.sql. Kode som avhenger av
  endringen pushes først etter at Adrian har kjørt SQL-en, ellers feiler de planlagte kjøringene.

### GitHub
- Privat repo AdrianNordbo/NM-insights, branch main. `gh` er ikke installert: Actions-logger kan ikke leses herfra.
- Workflow: cron 05, 06, 18, 19 UTC. Jobben `gate` regner ut Oslo-timen for utløseren og slipper bare
  gjennom 07 og 20 (håndterer sommer-/vintertid). workflow_dispatch kjører alltid. Jobbene `instagram`,
  `youtube` og `daily` (fetch_daily.py, Instagram og YouTube som egne steg) avhenger bare av gate, så en
  feil i én stopper ikke de andre.
- Instagram-kjøringene er verifisert (29.09 kl. 20:13 og 30.09 kl. 07:14), og YouTube-kjøringen fungerer i Actions.
- Secrets: META_ACCESS_TOKEN, IG_USER_ID, SUPABASE_URL, SUPABASE_SECRET_KEY, YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN.
- data/posts.json og data/youtube_videos.json finnes ikke i Actions; der er Supabase eneste lager.

### Innlogging i dashboardet (web/)
- Supabase Auth med innloggingslenke på e-post. Åpen registrering er av; `signInWithOtp` bruker
  `shouldCreateUser: false`. Innloggingskravet ligger både i `web/proxy.ts` (fornyer sesjonen, rask
  sjekk) og i server-layouten `web/app/(app)/layout.tsx` (`getUser()` mot Supabase Auth).
- Egen SMTP og token_hash-malen for Magic Link er på plass (02.10.2026). `/logg-inn` sender
  `emailRedirectTo: siteUrl()`, og malen lager `{{ .RedirectTo }}/auth/confirm?token_hash=…&type=email`.
  Testet i produksjon 02.10.2026, også på tvers av enheter (lenke bedt om på PC, åpnet på mobil i Safari).
  `/auth/callback` (PKCE) er fjernet. Testbrukere opprettes med «Create new user» + Auto Confirm.
- `/auth/confirm` (token_hash) finnes allerede: GET viser bare en knapp, og `verifyOtp` skjer først
  ved POST, så skannere som Microsoft Safe Links ikke bruker opp engangskoden.
- Oppsett for innlogging (punkt 1 og Magic Link-malen er på plass 02.10.2026):
  1. Egen SMTP i Supabase (standardavsenderen har lav grense og tillater ikke egne maler).
  2. E-postmalene i Supabase (Authentication → Emails → Templates):
     - Magic Link, emne «Din innloggingslenke til NM Insights»:
       `<h2>Logg inn på NM Insights</h2>`
       `<p>Klikk på lenken for å logge inn. Lenken kan brukes én gang og utløper etter en time.</p>`
       `<p><a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Logg inn</a></p>`
       `<p>Ba du ikke om denne e-posten, kan du se bort fra den.</p>`
     - Invite user, emne «Du er invitert til NM Insights»:
       `<h2>Du er invitert til NM Insights</h2>`
       `<p>Klikk på lenken for å aktivere tilgangen og logge inn. Lenken kan brukes én gang.</p>`
       `<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Aktiver tilgang</a></p>`
  3. Gjort 02.10.2026: `emailRedirectTo` er `siteUrl()` alene, og `/auth/callback` er fjernet.
  4. Email OTP Expiration = 3600 sekunder (samsvarer med «utløper etter en time» i malene).
- Adresse: https://insights.nordbomarketing.no (eget domene fra 02.10.2026, innlogging testet der).
  Den gamle adressen https://nm-insights-seven.vercel.app står som reserve.
- Supabase URL-innstillinger: Site URL `https://insights.nordbomarketing.no`. Redirect URLs, hver med
  og uten `/**`: `https://insights.nordbomarketing.no`, `https://nm-insights-seven.vercel.app` (reserve,
  så innlogging virker der også) og `http://localhost:3000`.
  NEXT_PUBLIC_SITE_URL i Vercel = `https://insights.nordbomarketing.no` (styrer lenken i e-posten).
- Vercel: prosjekt med Root Directory `web`, Node 24.x, funksjonsregion dub1 (samme sted som
  Supabase eu-west-1), Ignored Build Step og Deployment Protection på preview. Miljøvariabler:
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SITE_URL.
  `web/scripts/check-no-secrets.mjs` stopper bygget hvis nøkkelen med full tilgang finnes i web/.

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
Oppbygging: én seksjon per plattform (Instagram, YouTube (Shorts), TikTok «kommer»), deretter den manuelle
seksjonen. Plattformene sammenlignes aldri med hverandre. Rapportene lager ingen anbefalinger; foreløpig-
merkede grupper skal ikke ligge til grunn for anbefalingene Adrian skriver.

YouTube-seksjonen (report.py: load_youtube, youtube_month_section, youtube_week_section):
- Bare format SHORTS. Antall VIDEO som er holdt utenfor (i perioden og totalt) står alltid i rapporten.
- Hovedtall fra Data API (visninger, likes, kommentarer). Visningstid og andel sett (Analytics) bare for
  videoer der analytics_end_date dekker de første 7 Stillehavsdøgnene, med eget antall («Med Analytics»).
- Andel sett over 100 % forklares (Shorts looper) og kappes ikke. Ingen engasjementsrate (ingen rekkevidde
  per video), og ingen sammenligning med Instagram.
- Måned: nøkkeltall (Shorts, visninger, median visninger per Short, nye abonnenter), «Totalt for måneden»,
  konsepter (median/snitt visninger, median likes/kommentarer, visningstid, andel sett), beste/svakeste 3
  etter visninger, flagg som for Instagram.
- Uke: visninger i publiseringsdøgn + neste døgn (Stillehavstid) fra youtube_video_daily, mot median for
  Shorts i samme konsept publisert før uken (krever ≥ 6 med komplette tall). Rapporten sier at det ikke er
  nøyaktig 24/48 timer. Videoer uten Analytics-tall ennå står som «venter på Analytics».

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

## Frontend-regler (dashboard)
- Frontend leser bare fra schema `dashboard`, aldri fra public.
- Plattformer og formater vises hver for seg og sammenlignes aldri med hverandre.
- Følgertall (new_followers, followers_end) vises som «ikke nok data» når `days_with_follower_data` er
  lavere enn antall dager i perioden. For en periode som ikke er ferdig (`period_complete = false`)
  sammenlignes det med antall dager som har gått: fra period_start til og med i går (dagens døgn er
  aldri ferdig hos Meta eller YouTube). YouTube Analytics ligger 2–3 døgn etter, så YouTube viser
  «ikke nok data» de første dagene av en ny periode.
- `median_engagement_per_view` vises bare side om side med konsepter på samme plattform og format.
- Konseptet «Før konsepter» er skjult som standard.
- Grupper med `preliminary = true` merkes «foreløpig».
- Innhold med special_event (f.eks. VM 2026) vises som egne rader, ikke blandet inn i konseptene.
- Konsepter er «inaktiv» når det er 21 dager eller mer siden siste innlegg (`INACTIVE_AFTER_DAYS` i
  web/lib/oversikt/konsepter.ts), og aktive igjen ved neste innlegg. Ingen manuell statusliste.
- Instagram Feed er av som standard i alle seksjoner og slås på med `?feed=1`.
- Endring mot forrige periode vises i prosent bare når forrige verdi er minst 1 000; ellers pil + forrige verdi.
- Annonsevisninger (AD) holdes utenfor, og døgnene er Stillehavsdøgn (sagt i info-ikonene).
- Etiketter ved topper i grafene er «Mulig årsak: …», aldri en fasit.

## Dashboard (web/)
Adresse: https://insights.nordbomarketing.no (reserve: https://nm-insights-seven.vercel.app).
Next.js 16 (App Router) på Vercel, Recharts for grafer, Vitest for tester (`npm test` i web/). Design etter
v5-forhåndsvisningen (data/forhandsvisning/, lokal og gitignored). Siden er alltid lys når den åpnes;
sol/måne-knappen øverst til høyre slår mørk modus av og på mens siden er åpen (ingen lagring).

Oversikt (`/`), i rekkefølge:
1. Mørkeblått toppfelt: Uke | Måned | Total og piler (`?periode=uke&p=2026-W39`, `?periode=måned&p=2026-09`),
   Feed-bryteren, én regelbasert sammendragssetning per plattform og format (med «… inneholdt VM-innhold,
   så sammenligningen er skjev»), og plattformkort som stikker 70 px ut over kanten (visninger, endring,
   trend siste 12 perioder, følgere, nye følgere, innlegg publisert). Standardperiode = alltid inneværende
   uke/måned etter Oslo-kalenderen (osloToday), uten unntak; pilene stopper ved inneværende periode.
   Plattformenes døgn følger Stillehavstid: siste ferdige døgn = i går i Stillehavstid (pacificToday − 1).
   Uferdige perioder merkes «hittil, t.o.m. dd.mm» og sammenlignes med like mange dager i forrige periode.
   En plattform som ligger etter siste ferdige døgn (YouTube Analytics), eller som ennå ikke har data i
   perioden (f.eks. mandag morgen), merkes «data til og med dd.mm»; tallene vises da som «–», og det
   lages ingen sammendragssetning for den. Ingen andre tekster for tynne perioder.
   Rett over plattformkortene: «Anbefalinger · gjelder nå» (web/lib/oversikt/anbefalinger.ts, tersklene i
   anbefalinger-regler.ts). Én linje per plattform og format, uavhengig av valgt periode. Bare aktive, ikke
   foreløpige konsepter uten spesiell hendelse; Før konsepter, Ukjent, Annet/aktualitet og Bankinfo er utelatt.
   Prioritet: C (de 3 siste modne under ⅔ av median) → A (innlegg 7–14 dager med ≥ 1,5 × median) → B/B2
   (samme/ulike ledere på median visninger og engasjement per visning, lederen ≥ 10 % foran). Maks 3.
   Nye, foreløpige konsepter vises som tilleggslinje: «lovende, men for tidlig å si» når medianen er minst
   like høy som beste godkjente konsept, ellers «nytt konsept, for tidlig å si». Konsepter med ≥ 14 dager
   siden siste innlegg vises med «(siste innlegg dd.mm)». Hver linje har info-ikon med tallene.
   «Total» (`?periode=total`, web/lib/oversikt/total.ts): ett stort tall «Totalt siden start (dd.mm)» =
   summen av visninger per innlegg i content_latest publisert fra og med `takeover_date` (Oslo-dato), alle
   aldre, siste måling, uten annonsevisninger, uavhengig av special_event (VM skilles bare ut i konsepttabellen
   og anbefalingene). Instagram (Reels og
   Feed, alltid med uansett Feed-bryteren) og YouTube (Shorts); TikTok som plassholder. Ett kort per plattform
   med visninger, likes, kommentarer og delinger (delinger bare der tallet finnes, med «N av M innlegg» når
   noe mangler) og kumulativ kurve per publiseringsuke med dagens tall. Ingen piler, endringspiller,
   sammendragssetninger eller «Engasjement i perioden» i Total; ingen sammenligning eller andel mellom
   plattformene. Rekkefølge i Total: periodevelger → det store tallet (sentrert) → kortene → «Anbefalinger ·
   gjelder nå» som eget kort på den lyse bakgrunnen. I Uke/Måned står anbefalingene i toppfeltet. Standardvalget er fortsatt inneværende uke. Per 06.10.2026: 583 185 visninger (Instagram
   491 542, YouTube 91 643).
2. Engasjement i perioden (likes, kommentarer, delinger, lagringer for Instagram) fra daily_activity.
3. Ferske innlegg (under 7 dager), «tidlig signal · ikke endelige tall», per plattform og format, nyeste først.
4. Utvikling per dag: visninger og interaksjoner (likes + kommentarer + delinger + lagringer for Instagram,
   ikke Metas total_interactions) i to synkroniserte grafer, 7d/30d/90d/Alt (uavhengig av Uke/Måned),
   forrige periode stiplet, opptil 3 toppetiketter i rader, markering fra `takeover_date`. Plattformene
   rapporterer nettotall per døgn som kan være negative (f.eks. −1 like); grafen klipper ved 0, tooltipen
   viser faktisk verdi.
5. Hva funket sist (beste innlegg 7–14 dager gammelt, «×N av vanlig for konseptet»).
6. Konsepttabellen (median, modne innlegg, aktive → inaktive → foreløpige, trendlinje siste 10 innlegg,
   spesielle hendelser sammenfoldet, «Før konsepter» bak bryter `?vis=alle`).

Struktur: all logikk i rene funksjoner i web/lib/oversikt/ (periode, aktivitet, endring, kort, sammendrag,
graf, ferske, sist, konsepter, adresse, side) med tester ved siden av; komponentene i web/components/ bare
viser. Data hentes i web/app/(app)/page.tsx fra de fire dashboard-viewene som innlogget bruker.
Lokal test: web/.env.local trenger publishable-nøkkelen, og innlogging krever e-postlenken. Claude Code har
testet med en midlertidig, ikke-committet side som viser samme komponent med tall fra viewene.
«Trender og idéer» (`/trender`) er en tom plassholder.

## Veksthuset: kontekst
- Adrian tok over kontoen 15.06.2026 (første publiserte video). «Adrians periode» = fra denne datoen.
- Konsepter:
  - Folka Først: intervjuer om arbeidsrelevante temaer (podkast-format), aktiv
  - Sitcom: korte humoristiske episoder fra kontoret, inspirert av The Office (publiseres tirsdager)
  - Uten kompetanse: golf/turn o.l., byttet ut med På Gata fra uke 39 2026 (publisert torsdager). Blir
    inaktiv i dashboardet 21 dager etter siste innlegg
  - På Gata: gateintervjuer med ubehagelige/morsomme spørsmål (#PåGata)
  - CTF (Cut the fluff): relevante nyheter som feed-innlegg, inaktiv (siste innlegg 08.09.2026)
  - Bankinfo: Veksthusets egne informasjons- og reklameinnlegg (ikke et innholdskonsept)
  - Annet/aktualitet: alt utenfor konseptene, i praksis VM-Reels juni–juli 2026
  - Før konsepter: alle innlegg før 15.06.2026. Ukjent: ingen regel traff. Per 02.10.2026 ett innlegg:
    Instagram Feed 01.10.2026 «☕ Livet på Veksthuset» (ikke rettet i concept_overrides.csv ennå)
- Aktiv/inaktiv bestemmes av publisering, ikke av en manuell liste: et konsept er inaktivt når det har gått
  21 dager eller mer siden siste innlegg, og blir aktivt igjen ved neste innlegg.
- Konseptene har faste publiseringsdager, så ukedagseffekter for Reels er i praksis konsepteffekter.
- VM-innholdet (juni–juli 2026, 9 innlegg) har høyest rekkevidde av alle innlegg. is_vm/special_event
  markerer det på tvers av konsept. Rapporter Adrians periode med og uten VM, og mot samme periode i 2025
  (som bare har 3 feed-innlegg og derfor ikke gir sammenlignbare tall).
- Ingen innlegg er boostet etter det vi vet. Men Meta rapporterer annonsevisninger (format AD i account_daily):
  ca. 37 000 visninger mars–september 2026 (bl.a. ca. 12 000 i august). AD holdes utenfor dashboardet, så
  tallene der er organiske. Bør avklares med Eika (kjører de annonser med Veksthusets innhold?).
- Roller: Adrian planlegger og publiserer (tidspunkt, konseptmiks, frekvens). Innholdet produseres av en
  annen, så anbefalinger om innhold må formuleres slik at de kan sendes videre til produsenten.
- Produksjonstid per konsept er ukjent og skal ikke brukes i analysen.

## Konseptmerking (concepts.py)
- Regler i rekkefølge, første treff vinner: På Gata → Sitcom → Uten kompetanse → CTF (bare feed:
  #veksthuset, #cutthefluff, nyhets-hashtags) → Folka Først (podkast-hashtags, gjestenavn, «snakker om») →
  Bankinfo («vi skaper mer sammen», «ta kontakt», «sponsorturnering» …) → Annet (VM-hashtags) →
  Folka Først svakt signal (arbeidslivs-hashtags, bare Reels).
- YouTube (`platform="youtube"`, på tittel + beskrivelse): feed-regler (CTF) hoppes over, og Reels-regler
  gjelder alle videoer. Testet mot de 83 videoene 30.09.2026: ingen avvik fra bekreftede Instagram-konsepter.
- De 15 innleggene fra det svake signalet og de to ukjente (28.06 og 29.06) er bekreftet av Adrian og låst
  i concept_overrides.csv (17 rader, alle Folka Først).
- Endringer i merkingen når Supabase ved neste kjøring av fetch_instagram.py / fetch_youtube.py.

## Arbeidsflyt
- Ukentlig gjennomgang hver søndag (ukesrapport): justeringer av tidspunkt, rekkefølge og tester.
- Månedlig rapport: beslutninger om konsepter og rapportering til Veksthuset.
- Tidspunkt-tester registreres i time_tests.csv og følges opp i ukesrapporten.

## Kjente problemer og begrensninger
- GitHub kan forsinke cron, og pauser planlagte workflows etter 60 dager uten commits.
- API-ene gir av og til forbigående feil (f.eks. «Internal error encountered» fra YouTube Analytics).
  Alle Meta- og YouTube-kall prøves på nytt etter 2, 5 og 10 s ved nettverksfeil, HTTP 5xx/429,
  Googles backendError/rateLimitExceeded og Metas is_transient/rate limit-koder. Varige feil (ugyldig
  metric, brukt opp dagskvote) prøves ikke på nytt. Kanal-, videoliste- og innleggslistekallene er
  nødvendige; resten hoppes over enkeltvis og logges som «FEIL (hopper over)». Supabase-kall har ikke retry.
  Terskelen for rød kjøring (> 3 feilede kall, MAX_FAILED_CALLS i retry.py) er et fast antall. Den bør
  bli prosentbasert hvis antall videoer/innlegg (og dermed per-video-kall) vokser mye.
- post_insights-historikken startet 29.09.2026. Sammenligning på samme alder i ukesrapporten blir først mulig
  når konseptene har ≥ 6 målte innlegg (Sitcom med ett innlegg i uken: ca. 6 uker). Radene fra 29.09 er merket
  'morgen' selv om de ble hentet midt på dagen.
- account_insights 30.08–28.09.2026 har bare new_followers (fra Metas historikk); followers_count lagres fra
  29.09.2026. August har følgerdata for bare 2 av 31 dager.
- Metas døgn for følgere og unik rekkevidde følger Stillehavstid, ikke Oslo-tid.
- Meta rapporterer media_count 237, men media-listen gir 241 innlegg (ikke undersøkt).
- Unik rekkevidde per måned lagres ikke, og er bare tilgjengelig 2 år bakover.
- YouTube: to videoer (02.07, begge «Kom han seg opp til slutt?», 211 s) er VIDEO, ikke Shorts. De to nyeste
  videoene mangler Analytics til den har tatt dem igjen. Rekkevidde per video finnes ikke i YouTube-API-et.
- YouTube Analytics `views` teller alle avspillinger (som YouTube Studio); `engagedViews` er ca. 53 % av dette.
- average_view_percentage kan være over 100 % fordi Shorts looper (kappes ikke).
- db.select overstyrer en eventuell «limit» i params med sin egen sidedeling.
- Rapportene er på norsk; bare videoens tekster er på engelsk.

## Neste steg
1. TikTok: fullføre API-søknaden (demo-video), deretter integrasjon mot /business/get/ og /business/video/list/
2. Før Veksthuset inviteres: sjekk Invite user-malen og Email OTP Expiration (3600 s) i Supabase
   (se «Innlogging i dashboardet»). SMTP og Magic Link-malen er på plass, og Oversiktssiden er ferdig.
3. Publiseringsplan (planlagt side i dashboardet, ikke bygget): anbefalt plan for neste uke/måned med
   konsept per dag og tidsrom.
   - Første versjon er regelbasert. Hver anbefaling merkes «Basert på data» eller «Test» (med en hypotese).
   - Planen er et utkast Adrian vurderer, aldri noe som går rett til produsenten.
   - AI-delen venter til fase 2. Start da med å kartlegge hvilke data som finnes per ukedag og tidspunkt,
     og om Instagram fortsatt gir `online_followers`.
4. Fase 2 (agenter med Claude API) når det finnes betalende kunder

## Regler
- Aldri skriv ut, logg eller commit innholdet i .env. Tokens og nøkler skal aldri stå i URL-er eller
  feilmeldinger. Før hver commit: søk i stagede filer etter verdiene til META_ACCESS_TOKEN, SUPABASE_SECRET_KEY,
  YOUTUBE_CLIENT_SECRET og YOUTUBE_REFRESH_TOKEN.
- Repoet er privat. data/, .venv/, .env og secrets/ skal aldri committes. Commit og push bare når Adrian ber om det.
- Commit-meldinger på engelsk, med Co-Authored-By-linje.
- Tidspunkt analyseres i Europe/Oslo.
- Bruk median i tillegg til gjennomsnitt. Enkeltinnlegg med ekstrem rekkevidde (f.eks. VM) skal ikke skjule mønstrene.
- Konsepter i ulike formater (Reels vs. feed) skal ikke sammenlignes direkte på rekkevidde.
  Sammenlign innenfor samme format, eller bruk relative mål som engasjementsrate.
- Rapporter alltid antall innlegg per konsept. Funn basert på under 6 innlegg merkes «foreløpig».
- Innlegg yngre enn 7 dager utelates fra sammenligninger av endelige tall.
- Rekkevidde summert over innlegg er ikke unike personer, og skal merkes slik hvis den vises.
- Sammenlign bare innenfor samme plattform og format. YouTube-videoer med format VIDEO holdes utenfor
  Shorts-analysen.
- YouTube: utelat-regelen (yngre enn 7 dager) gjelder Data API-tallene. Dype mål (seertid, visningstid,
  andel sett) brukes bare når analytics_end_date dekker innlegget, så ulik alder ikke sammenlignes.
- YouTube: kommentarer og likes fra Data API er hovedtall. Ikke bland Data API og Analytics i samme beregning.
- youtube_video_daily (Analytics, Stillehavsdøgn) og youtube_video_insights (øyeblikksbilder) er ulike kilder
  og skal aldri blandes. «Samme alder» fra daily = publiseringsdøgn + neste døgn, ikke eksakte timer.
- Ingen grants til anon/authenticated på noe i public. Frontend skal bare lese fra schema dashboard.
- Demo og materiale til tredjeparter skal anonymiseres (kundenavn, captions, lenker), og eksempeltall
  skal merkes tydelig på hvert element.
