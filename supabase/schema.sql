-- NM Insights - databaseskjema
--
-- Tre tabeller:
--   accounts       én rad per kundekonto (f.eks. Veksthuset på Instagram)
--   posts          én rad per innlegg: metadata og konsept (endres sjelden)
--   post_insights  én rad per innlegg per dag: innsiktstall (øyeblikksbilder over tid)
--   account_insights  én rad per konto per dag: følgere og antall innlegg
--   youtube_videos, youtube_video_insights, youtube_video_daily  YouTube (se egne seksjoner)
--   account_daily  én rad per konto per døgn per format: aktivitet på hele kontoen
--
-- Tilgang: bare service_role (backend med SUPABASE_SECRET_KEY).
-- RLS er på uten policies, så anon og authenticated får ingenting selv om de
-- skulle få rettigheter senere. service_role omgår RLS.
--
-- Kjøres i Supabase SQL Editor. Skriptet kan kjøres flere ganger.

begin;

-- ---------------------------------------------------------------------------
-- Kontoer / kunder
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
    id                  bigint generated always as identity primary key,
    client_name         text not null,                 -- kunden, f.eks. "Veksthuset"
    platform            text not null default 'instagram'
                        check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube')),
    platform_account_id text not null,                 -- IG_USER_ID for Instagram
    username            text,
    timezone            text not null default 'Europe/Oslo',
    concepts_start      date,                          -- innlegg før denne datoen: "Før konsepter"
    active              boolean not null default true, -- false = hentes ikke lenger daglig
    created_at          timestamptz not null default now(),
    unique (platform, platform_account_id)
);

comment on table public.accounts is 'Én rad per kundekonto på én plattform.';

-- Lagt til etter første versjon: 'youtube' i platform-constrainten (se supabase/migrations/)
alter table public.accounts drop constraint if exists accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check
    check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'));
do $$
begin
    if (select count(*) from pg_constraint
        where conrelid = 'public.accounts'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%platform%') <> 1 then
        raise exception 'Uventet antall platform-constraints på accounts. Avbryter.';
    end if;
end $$;

-- Lagt til etter første versjon: når Nordbø Marketing tok over kontoen (se supabase/migrations/)
alter table public.accounts add column if not exists takeover_date date;
comment on column public.accounts.takeover_date is
    'Datoen Nordbø Marketing tok over kontoen. Vises som markering i dashboardets grafer.';

-- Lagt til etter første versjon: startverdi for følgere (se supabase/migrations/2026-10-15_followers.sql)
alter table public.accounts add column if not exists followers_start        integer;
alter table public.accounts add column if not exists followers_start_date   date;
alter table public.accounts add column if not exists followers_start_source text;

comment on column public.accounts.followers_start is
    'Følgere/abonnenter ved starten av followers_start_date (= utgangen av dagen før). null = ukjent.';
comment on column public.accounts.followers_start_date is
    'Datoen startverdien gjelder fra (vanligvis takeover_date).';
comment on column public.accounts.followers_start_source is
    'Hvor startverdien kommer fra, f.eks. «manuelt (Meta Insikt)» eller «YouTube Analytics».';

do $$
begin
    if not exists (select 1 from pg_constraint
                   where conname = 'accounts_followers_start_check'
                     and conrelid = 'public.accounts'::regclass) then
        alter table public.accounts add constraint accounts_followers_start_check check (
            (followers_start is null) = (followers_start_date is null)
            and (followers_start is null) = (followers_start_source is null)
            and (followers_start is null or followers_start >= 0)
        );
    end if;
end $$;


-- ---------------------------------------------------------------------------
-- Innlegg: metadata og konsept
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
    id                  bigint generated always as identity primary key,
    account_id          bigint not null references public.accounts (id) on delete restrict,
    platform_post_id    text not null,                 -- media-ID fra Meta
    published_at        timestamptz not null,
    media_type          text,                          -- IMAGE, VIDEO, CAROUSEL_ALBUM
    media_product_type  text,                          -- FEED, REELS, STORY
    caption             text,
    hashtags            text[] not null default '{}',  -- uten #, små bokstaver
    permalink           text,

    concept             text,
    concept_source      text check (concept_source in ('auto', 'manuell')),
    concept_reason      text,
    special_event       text,                          -- f.eks. 'VM 2026' (erstatter is_vm), null = vanlig innlegg

    first_seen_at       timestamptz not null default now(),
    last_seen_at        timestamptz not null default now(), -- siste gang innlegget fantes i API-et
    updated_at          timestamptz not null default now(),
    unique (account_id, platform_post_id)
);

create index if not exists posts_account_published_idx
    on public.posts (account_id, published_at desc);

comment on table public.posts is 'Én rad per innlegg. Avledede felt (ukedag, time, lengde) beregnes i analysen.';
comment on column public.posts.last_seen_at is 'Hvis denne henger etter, er innlegget trolig slettet eller arkivert.';

-- ---------------------------------------------------------------------------
-- Daglige øyeblikksbilder av innsiktstall
-- ---------------------------------------------------------------------------
create table if not exists public.post_insights (
    post_id             bigint not null references public.posts (id) on delete cascade,
    snapshot_date       date not null,                 -- dato i kontoens tidssone
    snapshot_slot       text not null default 'morgen' -- to kjøringer per dag (07 og 20)
                        check (snapshot_slot in ('morgen', 'kveld')),
    fetched_at          timestamptz not null default now(),

    reach               integer,
    views               integer,
    likes               integer,
    comments            integer,
    saved               integer,
    shares              integer,
    total_interactions  integer,
    avg_watch_time_ms   integer,                       -- bare Reels
    total_watch_time_ms bigint,                        -- bare Reels

    engagement_rate     numeric generated always as (
        case when reach > 0 then total_interactions::numeric / reach end
    ) stored,

    raw                 jsonb,                         -- hele API-svaret, for metrics vi ikke har kolonner for ennå

    primary key (post_id, snapshot_date, snapshot_slot) -- ny kjøring i samme slot oppdaterer raden
);

create index if not exists post_insights_date_idx
    on public.post_insights (snapshot_date);

comment on table public.post_insights is 'Én rad per innlegg per dag og slot (morgen/kveld). Tallene er kumulative.';

-- Lagt til etter første versjon: snapshot_slot i nøkkelen (se supabase/migrations/)
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'post_insights'
          and column_name = 'snapshot_slot'
    ) then
        alter table public.post_insights
            add column snapshot_slot text not null default 'morgen'
            check (snapshot_slot in ('morgen', 'kveld'));
        alter table public.post_insights drop constraint post_insights_pkey;
        alter table public.post_insights add primary key (post_id, snapshot_date, snapshot_slot);
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Daglige øyeblikksbilder av kontoen
-- Meta gir bare 30 dagers følgerhistorikk, så vi tar vare på den selv.
-- ---------------------------------------------------------------------------
create table if not exists public.account_insights (
    account_id          bigint not null references public.accounts (id) on delete cascade,
    snapshot_date       date not null,                 -- dato i kontoens tidssone
    fetched_at          timestamptz not null default now(),

    followers_count     integer,
    follows_count       integer,
    media_count         integer,                       -- antall innlegg på kontoen
    new_followers       integer,                       -- nye følgere dette døgnet (Metas follower_count)

    raw                 jsonb,                         -- hele API-svaret

    primary key (account_id, snapshot_date)            -- ny kjøring samme dag oppdaterer raden
);

-- Lagt til etter første versjon av skjemaet
alter table public.account_insights add column if not exists new_followers integer;

create index if not exists account_insights_date_idx
    on public.account_insights (snapshot_date);

comment on table public.account_insights is 'Én rad per konto per dag: følgere og antall innlegg over tid.';

-- ---------------------------------------------------------------------------
-- Siste øyeblikksbilde per innlegg (det analyze.py trenger)
-- security_invoker = false: viewet kjører med eierens rettigheter, slik at dashboard-viewene kan lese
-- det uten at authenticated har tilgang til rådatatabellene. Bare service_role har SELECT på det.
-- (Se supabase/migrations/2026-09-30_latest_views_owner_rights.sql.)
-- ---------------------------------------------------------------------------
create or replace view public.posts_latest
with (security_invoker = false) as
select distinct on (p.id)
    p.*,
    i.snapshot_date,
    i.fetched_at,
    i.reach, i.views, i.likes, i.comments, i.saved, i.shares,
    i.total_interactions, i.avg_watch_time_ms, i.total_watch_time_ms,
    i.engagement_rate,
    i.raw,
    i.snapshot_slot
from public.posts p
left join public.post_insights i on i.post_id = p.id
order by p.id, i.snapshot_date desc, i.fetched_at desc;

-- ---------------------------------------------------------------------------
-- YouTube: videoer
-- ---------------------------------------------------------------------------
create table if not exists public.youtube_videos (
    id                  bigint generated always as identity primary key,
    account_id          bigint not null references public.accounts (id) on delete restrict,
    platform_video_id   text not null,                 -- YouTube video-ID
    published_at        timestamptz not null,
    title               text,
    description         text,
    duration_s          integer,
    format              text check (format in ('SHORTS', 'VIDEO')),
    format_source       text check (format_source in ('analytics', 'varighet')),
                                                       -- analytics = creatorContentType;
                                                       -- varighet = foreløpig (≤ 180 s) til Analytics har klassifisert
    hashtags            text[] not null default '{}',  -- fra tittel og beskrivelse, uten #, små bokstaver
    permalink           text,

    concept             text,
    concept_source      text check (concept_source in ('auto', 'manuell')),
    concept_reason      text,
    special_event       text,

    first_seen_at       timestamptz not null default now(),
    last_seen_at        timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (account_id, platform_video_id)
);

create index if not exists youtube_videos_account_published_idx
    on public.youtube_videos (account_id, published_at desc);

comment on table public.youtube_videos is 'Én rad per YouTube-video. format fra Analytics creatorContentType.';

-- ---------------------------------------------------------------------------
-- YouTube: øyeblikksbilder per video (to per dag)
-- ---------------------------------------------------------------------------
create table if not exists public.youtube_video_insights (
    video_id                    bigint not null references public.youtube_videos (id) on delete cascade,
    snapshot_date               date not null,          -- dato i kontoens tidssone
    snapshot_slot               text not null default 'morgen'
                                check (snapshot_slot in ('morgen', 'kveld')),
    fetched_at                  timestamptz not null default now(),

    -- Data API, sanntid (hovedtall)
    views                       bigint,
    likes                       integer,
    comments                    integer,

    -- Analytics, kumulativt fra publisering til og med analytics_end_date
    analytics_end_date          date,
    a_views                     bigint,
    engaged_views               bigint,                 -- sekundær: strengere visningsdefinisjon
    estimated_minutes_watched   numeric,
    average_view_duration_s     numeric,
    average_view_percentage     numeric,                -- kan være over 100 fordi Shorts looper; kappes ikke

    -- Analytics per-video-kall (siste 30 dager, eller alle én gang i uken); ellers null
    shares                      integer,
    subscribers_gained          integer,
    subscribers_lost            integer,

    raw                         jsonb,
    primary key (video_id, snapshot_date, snapshot_slot)
);

create index if not exists youtube_video_insights_date_idx
    on public.youtube_video_insights (snapshot_date);

comment on table public.youtube_video_insights is
    'Én rad per video per dag og slot. Data API-tall er sanntid; a_* og dype mål gjelder til og med analytics_end_date.';

-- ---------------------------------------------------------------------------
-- YouTube: daglig Analytics per video (historikk og samme alder)
-- ---------------------------------------------------------------------------
create table if not exists public.youtube_video_daily (
    video_id                    bigint not null references public.youtube_videos (id) on delete cascade,
    day                         date not null,          -- Analytics-døgn (Stillehavstid)
    views                       bigint,
    engaged_views               bigint,
    estimated_minutes_watched   numeric,
    average_view_duration_s     numeric,
    average_view_percentage     numeric,
    likes                       integer,
    comments                    integer,
    shares                      integer,
    subscribers_gained          integer,
    subscribers_lost            integer,
    fetched_at                  timestamptz not null default now(),
    primary key (video_id, day)
);

comment on table public.youtube_video_daily is
    'Analytics per video per døgn (Stillehavstid). Tall per døgn, ikke kumulative. Kilde: Analytics, ikke Data API.';

-- ---------------------------------------------------------------------------
-- YouTube: siste tall per video
-- Data API- og Analytics-tall fra nyeste øyeblikksbilde; shares og abonnenter fra
-- nyeste øyeblikksbilde der de ble hentet (per_video_end_date).
-- ---------------------------------------------------------------------------
create or replace view public.youtube_videos_latest
with (security_invoker = false) as
select distinct on (v.id)
    v.*,
    i.snapshot_date,
    i.snapshot_slot,
    i.fetched_at,
    i.views, i.likes, i.comments,
    i.analytics_end_date,
    i.a_views, i.engaged_views, i.estimated_minutes_watched,
    i.average_view_duration_s, i.average_view_percentage,
    s.shares, s.subscribers_gained, s.subscribers_lost,
    s.analytics_end_date as per_video_end_date
from public.youtube_videos v
left join public.youtube_video_insights i on i.video_id = v.id
left join lateral (
    select x.shares, x.subscribers_gained, x.subscribers_lost, x.analytics_end_date
    from public.youtube_video_insights x
    where x.video_id = v.id and x.shares is not null
    order by x.snapshot_date desc, x.fetched_at desc
    limit 1
) s on true
order by v.id, i.snapshot_date desc, i.fetched_at desc;

-- ---------------------------------------------------------------------------
-- Daglig aktivitet per konto og format (hele kontoen, også eldre innlegg)
-- Døgn i Stillehavstid (Meta og YouTube Analytics). Formatene og interactions er forklart i
-- supabase/migrations/2026-10-01_account_daily.sql.
-- ---------------------------------------------------------------------------
create table if not exists public.account_daily (
    account_id      bigint not null references public.accounts (id) on delete cascade,
    activity_date   date not null,                 -- plattformens døgn (Stillehavstid)
    format          text not null
                    check (format in ('ALL', 'REELS', 'FEED', 'STORY', 'AD', 'SHORTS', 'VIDEO', 'LIVE', 'OTHER')),
    views           bigint,
    likes           bigint,
    comments        bigint,
    shares          bigint,
    saves           bigint,                        -- null for YouTube
    interactions    bigint,                        -- Instagram: total_interactions; YouTube: likes + comments + shares
    raw             jsonb,                         -- API-verdiene raden er bygget av
    fetched_at      timestamptz not null default now(),
    primary key (account_id, activity_date, format)
);

create index if not exists account_daily_date_idx on public.account_daily (activity_date);

comment on table public.account_daily is
    'Én rad per konto per døgn (Stillehavstid) per format: aktivitet på hele kontoen, også eldre innlegg. '
    'Instagram fra Meta (media_product_type), YouTube fra Analytics (creatorContentType).';

-- ---------------------------------------------------------------------------
-- TikTok: engangs-state for autoriseringslenken
-- Lages av tiktok_link.py (service_role). Bare hashen lagres, så en lekket tabell gir ingen gyldig lenke.
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_oauth_states (
    state_hash      text primary key,                       -- hex(SHA-256(state))
    account_id      bigint not null references public.accounts (id) on delete cascade,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null default now() + interval '30 minutes',
    used_at         timestamptz,                            -- løst inn av callbacken (bare én gang)
    used_by         uuid,                                   -- auth.users.id for den innloggede brukeren
    stored_at       timestamptz                             -- tokenet er lagret (bare én gang)
);

comment on table public.tiktok_oauth_states is
    'Engangs-state for TikToks autoriseringslenke. 30 minutters levetid. Bare hashen lagres.';

-- ---------------------------------------------------------------------------
-- TikTok: tokens (kryptert)
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_tokens (
    account_id          bigint primary key references public.accounts (id) on delete cascade,
    open_id             text not null,                      -- TikToks app-spesifikke ID for kontoen
    scope               text[] not null default '{}',       -- scopes kontoeieren ga
    refresh_token_enc   text not null,                      -- base64(sealed box), aldri klartekst
    refresh_expires_at  timestamptz,                        -- 1 år fra autorisering; ny kobling etter det
    status              text not null default 'ok'
                        check (status in ('ok', 'needs_reauth', 'revoked')),
    authorized_at       timestamptz not null default now(),
    authorized_by       uuid,                               -- auth.users.id
    last_refresh_at     timestamptz,                        -- siste vellykkede fornyelse (fetch_tiktok.py)
    last_error          text,                               -- siste feilmelding, uten tokens
    updated_at          timestamptz not null default now()
);

comment on table public.tiktok_tokens is
    'Kryptert TikTok-refresh-token per konto. Bare service_role. Access-tokenet lagres aldri.';

-- ---------------------------------------------------------------------------
-- TikTok: innlegg
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_videos (
    id                  bigint generated always as identity primary key,
    account_id          bigint not null references public.accounts (id) on delete restrict,
    platform_video_id   text not null,                      -- TikToks item_id
    published_at        timestamptz not null,               -- create_time
    caption             text,
    media_type          text check (media_type in ('VIDEO', 'PHOTO')),
    duration_s          numeric,                            -- video_duration (sekunder)
    is_ad               boolean,                            -- brukt i annonse: visningene kan inneholde betalt visning
    hashtags            text[] not null default '{}',       -- fra caption, uten #, små bokstaver
    permalink           text,                               -- share_url uten utm-parametere

    concept             text,
    concept_source      text check (concept_source in ('auto', 'manuell')),
    concept_reason      text,
    special_event       text,

    first_seen_at       timestamptz not null default now(),
    last_seen_at        timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (account_id, platform_video_id)
);

create index if not exists tiktok_videos_account_published_idx
    on public.tiktok_videos (account_id, published_at desc);

comment on table public.tiktok_videos is
    'Én rad per TikTok-innlegg (VIDEO eller PHOTO). Avledede felt (tittel = første linje, ukedag) lagres ikke.';

-- ---------------------------------------------------------------------------
-- TikTok: øyeblikksbilder per innlegg (to per dag)
-- TikTok gir levetidstall med 24-48 timers forsinkelse. Dype mål (video.insights) kan mangle for
-- innlegg uten aktivitet de siste 7 dagene; da er de null i den målingen.
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_video_insights (
    video_id                    bigint not null references public.tiktok_videos (id) on delete cascade,
    snapshot_date               date not null,              -- dato i kontoens tidssone
    snapshot_slot               text not null default 'morgen'
                                check (snapshot_slot in ('morgen', 'kveld')),
    fetched_at                  timestamptz not null default now(),

    -- video.list
    views                       bigint,                     -- video_views (organisk + betalt)
    likes                       integer,
    comments                    integer,
    shares                      integer,                    -- inkl. «Send til venner»
    favorites                   integer,
    reach                       integer,

    -- video.insights
    total_time_watched_s        numeric,
    average_time_watched_s      numeric,
    full_video_watched_rate     numeric,                    -- andel 0-1
    new_followers               integer,
    profile_views               integer,                    -- bare Business-kontoer, ellers null

    raw                         jsonb,                      -- API-svaret for innlegget, aldri tokens
    primary key (video_id, snapshot_date, snapshot_slot)
);

create index if not exists tiktok_video_insights_date_idx
    on public.tiktok_video_insights (snapshot_date);

comment on table public.tiktok_video_insights is
    'Én rad per TikTok-innlegg per dag og slot. Levetidstall, 24-48 t forsinkelse. Samme dag + slot oppdaterer raden.';

-- ---------------------------------------------------------------------------
-- TikTok: siste tall per innlegg
-- Tellinger fra nyeste måling; dype mål fra nyeste måling der reach fantes (de forsvinner fra API-et
-- når innlegget har vært uten aktivitet i 7 dager).
-- ---------------------------------------------------------------------------
create or replace view public.tiktok_videos_latest
with (security_invoker = false) as
select distinct on (v.id)
    v.*,
    i.snapshot_date,
    i.snapshot_slot,
    i.fetched_at,
    i.views, i.likes, i.comments, i.shares, i.favorites,
    d.reach, d.total_time_watched_s, d.average_time_watched_s, d.full_video_watched_rate,
    d.new_followers, d.profile_views,
    d.snapshot_date as deep_snapshot_date
from public.tiktok_videos v
left join public.tiktok_video_insights i on i.video_id = v.id
left join lateral (
    select x.reach, x.total_time_watched_s, x.average_time_watched_s, x.full_video_watched_rate,
           x.new_followers, x.profile_views, x.snapshot_date
    from public.tiktok_video_insights x
    where x.video_id = v.id and x.reach is not null
    order by x.snapshot_date desc, x.fetched_at desc
    limit 1
) d on true
order by v.id, i.snapshot_date desc, i.fetched_at desc;

-- ---------------------------------------------------------------------------
-- Row Level Security: på, uten policies
-- ---------------------------------------------------------------------------
alter table public.accounts      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_insights enable row level security;
alter table public.account_insights enable row level security;
alter table public.youtube_videos         enable row level security;
alter table public.youtube_video_insights enable row level security;
alter table public.youtube_video_daily    enable row level security;
alter table public.account_daily          enable row level security;
alter table public.tiktok_oauth_states    enable row level security;
alter table public.tiktok_tokens          enable row level security;
alter table public.tiktok_videos          enable row level security;
alter table public.tiktok_video_insights  enable row level security;

-- ---------------------------------------------------------------------------
-- Rettigheter: eksplisitt, og bare til service_role
-- ---------------------------------------------------------------------------
revoke all on public.accounts, public.posts, public.post_insights, public.account_insights,
    public.posts_latest,
    public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily,
    public.youtube_videos_latest, public.account_daily,
    public.tiktok_oauth_states, public.tiktok_tokens, public.tiktok_videos, public.tiktok_video_insights,
    public.tiktok_videos_latest
    from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.accounts, public.posts, public.post_insights, public.account_insights,
       public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily,
       public.account_daily,
       public.tiktok_oauth_states, public.tiktok_tokens, public.tiktok_videos, public.tiktok_video_insights
    to service_role;
grant select on public.posts_latest, public.youtube_videos_latest, public.tiktok_videos_latest to service_role;
-- Identity-kolonner bruker sekvenser; nødvendig for insert
grant usage, select on sequence public.accounts_id_seq, public.posts_id_seq,
    public.youtube_videos_id_seq, public.tiktok_videos_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Første kunde
-- ---------------------------------------------------------------------------
insert into public.accounts (client_name, platform, platform_account_id, username, concepts_start)
values ('Veksthuset', 'instagram', '17841450044968553', 'veksthusene', '2026-06-15'),
       ('Veksthuset', 'youtube', 'UChv7DsnM326j78XEZBWyTPg', 'Veksthuset', '2026-06-15')
on conflict (platform, platform_account_id) do nothing;

update public.accounts set takeover_date = date '2026-06-15'
where client_name = 'Veksthuset' and takeover_date is null;

-- YouTube: 0 abonnenter ved starten av 15.06 (YouTube Analytics, nye − tapte 04.06–14.06).
-- Instagram og TikTok mangler startverdi (legges inn manuelt, se 2026-10-15_followers.sql).
update public.accounts
   set followers_start = 0, followers_start_date = date '2026-06-15',
       followers_start_source = 'YouTube Analytics (nye − tapte 04.06–14.06)'
 where platform = 'youtube' and platform_account_id = 'UChv7DsnM326j78XEZBWyTPg' and followers_start is null;

-- TikTok: platform_account_id er 'pending:veksthuset' til kontoen er koblet (da settes den til open_id)
insert into public.accounts (client_name, platform, platform_account_id, concepts_start, takeover_date)
select 'Veksthuset', 'tiktok', 'pending:veksthuset', date '2026-06-15', date '2026-06-15'
where not exists (
    select 1 from public.accounts where client_name = 'Veksthuset' and platform = 'tiktok'
);

-- ---------------------------------------------------------------------------
-- Dashboard (schema dashboard): sammenstilte views for frontend
-- authenticated får bare USAGE på schemaet og SELECT på viewene. Viewene og «latest»-viewene
-- kjører med eierens rettigheter (security_invoker = false), så authenticated når aldri rådata.
-- ---------------------------------------------------------------------------
create schema if not exists dashboard;

-- ---------------------------------------------------------------------------
-- 1. content_latest: én rad per innlegg/video, siste måling
-- ---------------------------------------------------------------------------
create or replace view dashboard.content_latest
with (security_invoker = false) as
select
    'instagram'::text                                            as platform,
    p.account_id,
    p.platform_post_id                                           as content_id,
    (p.published_at at time zone 'Europe/Oslo')                  as published_at,   -- lokal Oslo-tid
    p.media_product_type                                         as format,          -- REELS / FEED
    p.concept,
    p.special_event,
    p.views::bigint                                              as views,
    p.likes::bigint                                              as likes,
    p.comments::bigint                                           as comments,
    round((extract(epoch from (now() - p.published_at)) / 86400)::numeric, 1) as age_days,
    (p.published_at <= now() - interval '7 days')                as is_mature,
    left(nullif(btrim(split_part(coalesce(p.caption, ''), E'\n', 1)), ''), 200) as title,
    p.permalink,
    p.fetched_at,
    p.shares::bigint                                             as shares,
    false                                                        as pending         -- ny
from public.posts_latest p
union all
select
    'youtube'::text,
    y.account_id,
    y.platform_video_id,
    (y.published_at at time zone 'Europe/Oslo'),
    y.format,                                                                         -- bare SHORTS
    y.concept,
    y.special_event,
    y.views,                                                                          -- Data API, sanntid
    y.likes::bigint,
    y.comments::bigint,
    round((extract(epoch from (now() - y.published_at)) / 86400)::numeric, 1),
    (y.published_at <= now() - interval '7 days'),
    y.title,
    y.permalink,
    y.fetched_at,
    y.shares::bigint,                                                                 -- per-video-Analytics, null der det mangler
    false
from public.youtube_videos_latest y
where y.format = 'SHORTS'                                                             -- VIDEO holdes utenfor
union all
select
    'tiktok'::text,
    t.account_id,
    t.platform_video_id,
    (t.published_at at time zone 'Europe/Oslo'),
    t.media_type,                                                                     -- VIDEO / PHOTO
    t.concept,
    t.special_event,
    t.views,                                                                          -- video_views, levetid
    t.likes::bigint,
    t.comments::bigint,
    round((extract(epoch from (now() - t.published_at)) / 86400)::numeric, 1),
    (t.published_at <= now() - interval '7 days'),
    left(nullif(btrim(regexp_replace(split_part(coalesce(t.caption, ''), E'\n', 1),
                                     '(\s*#\S+)+\s*$', '')), ''), 200),             -- uten hashtags bakerst
    t.permalink,
    t.fetched_at,
    t.shares::bigint,
    (t.published_at > now() - interval '7 days'
     and (coalesce(t.views, 0) = 0 or t.deep_snapshot_date is null))                  -- ikke behandlet ennå
from public.tiktok_videos_latest t;

comment on view dashboard.content_latest is
    'Én rad per innlegg/video (siste måling). YouTube: Data API-tall, bare SHORTS. TikTok: levetidstall '
    '(video_views, kan inneholde betalt visning), format VIDEO/PHOTO. published_at i Europe/Oslo. '
    'title = første linje av captionen (Instagram, TikTok) eller videotittelen (YouTube). fetched_at er '
    'timestamptz. shares: null der tallet mangler. pending = TikTok har ikke behandlet tallene ennå.';

-- ---------------------------------------------------------------------------
-- 2. concept_summary: median per plattform + format + konsept, bare modne innlegg
-- ---------------------------------------------------------------------------
create or replace view dashboard.concept_summary
with (security_invoker = false) as
select
    c.platform,
    c.account_id,
    c.format,
    c.concept,
    c.special_event,
    count(*)                                                       as posts,
    percentile_cont(0.5) within group (order by c.views)           as median_views,
    percentile_cont(0.5) within group (order by c.likes)           as median_likes,
    percentile_cont(0.5) within group (order by c.comments)        as median_comments,
    (count(*) < 6)                                                 as preliminary,
    percentile_cont(0.5) within group (
        order by (c.likes + c.comments)::numeric / nullif(c.views, 0)
    )                                                              as median_engagement_per_view
from dashboard.content_latest c
where c.is_mature
group by c.platform, c.account_id, c.format, c.concept, c.special_event;

comment on view dashboard.concept_summary is
    'Median per plattform + konto + format + konsept + special_event, bare innlegg ≥ 7 dager. '
    'Innhold med special_event (f.eks. VM) får egne rader. preliminary = under 6 innlegg. '
    'median_engagement_per_view skal bare sammenlignes innenfor samme plattform og format.';

comment on column dashboard.concept_summary.median_engagement_per_view is
    'Median av (likes + comments) / views per innlegg, bare modne innlegg. Sammenlign bare innenfor '
    'samme plattform og format. Ikke samme definisjon som engasjementsraten i Instagram-rapporten '
    '(total_interactions / reach).';

-- ---------------------------------------------------------------------------
-- 3. platform_summary: per plattform + format + periode (uke/måned), med forrige periode
-- Perioder genereres fra første innlegg til i dag, så også perioder uten innlegg får en rad.
-- Innleggstall og median er per format (Reels og feed blandes ikke). Følgertall gjelder hele
-- kontoen og er derfor like for alle formater på samme konto.
-- ---------------------------------------------------------------------------
create or replace view dashboard.platform_summary
with (security_invoker = false) as
with formats as (
    select distinct c.platform, c.account_id, c.format
    from dashboard.content_latest c
),
periods as (
    select f.platform, f.account_id, f.format, pt.period_type,
           gs::date                                               as period_start,
           (gs + pt.step)::date - 1                               as period_end
    from formats f
    cross join (values ('uke', 'week', interval '1 week'),
                       ('måned', 'month', interval '1 month')) as pt(period_type, unit, step)
    cross join lateral generate_series(
        date_trunc(pt.unit, (select min(c.published_at) from dashboard.content_latest c
                             where c.account_id = f.account_id)),
        date_trunc(pt.unit, now() at time zone 'Europe/Oslo'),
        pt.step) as gs
),
content as (
    select pr.platform, pr.account_id, pr.format, pr.period_type, pr.period_start, pr.period_end,
           count(c.content_id)                                                       as published,
           count(c.content_id) filter (where c.is_mature)                            as mature_posts,
           percentile_cont(0.5) within group (order by c.views) filter (where c.is_mature) as median_views
    from periods pr
    left join dashboard.content_latest c
           on c.account_id = pr.account_id
          and c.format = pr.format
          and c.published_at >= pr.period_start
          and c.published_at < pr.period_end + 1
    group by pr.platform, pr.account_id, pr.format, pr.period_type, pr.period_start, pr.period_end
),
followers as (
    select pr.account_id, pr.period_type, pr.period_start,
           sum(ai.new_followers)                                   as new_followers,
           count(ai.new_followers)                                 as days_with_follower_data,
           (array_agg(ai.followers_count order by ai.snapshot_date desc)
                filter (where ai.followers_count is not null))[1]  as followers_end
    from (select distinct account_id, period_type, period_start, period_end from periods) pr
    left join public.account_insights ai
           on ai.account_id = pr.account_id
          and ai.snapshot_date between pr.period_start and pr.period_end
    group by pr.account_id, pr.period_type, pr.period_start
)
select
    c.platform, c.account_id, c.format, c.period_type, c.period_start, c.period_end,
    (c.period_end < (now() at time zone 'Europe/Oslo')::date)     as period_complete,
    c.published, c.mature_posts, c.median_views,
    f.new_followers, f.days_with_follower_data, f.followers_end,
    lag(c.published)      over w                                  as prev_published,
    lag(c.mature_posts)   over w                                  as prev_mature_posts,
    lag(c.median_views)   over w                                  as prev_median_views,
    lag(f.new_followers)  over w                                  as prev_new_followers,
    lag(f.days_with_follower_data) over w                         as prev_days_with_follower_data,
    lag(f.followers_end)  over w                                  as prev_followers_end
from content c
join followers f
  on f.account_id = c.account_id and f.period_type = c.period_type and f.period_start = c.period_start
window w as (partition by c.account_id, c.format, c.period_type order by c.period_start);

comment on view dashboard.platform_summary is
    'Per plattform + konto + format + periode (uke/måned). median_views bare for innlegg ≥ 7 dager. '
    'new_followers/followers_end gjelder hele kontoen. prev_* = forrige periode.';

-- ---------------------------------------------------------------------------
-- 4. daily_activity: aktivitet per konto per døgn per format, med data_through og takeover_date
-- ---------------------------------------------------------------------------
create or replace view dashboard.daily_activity
with (security_invoker = false) as
select
    a.platform,
    d.account_id,
    d.activity_date,
    d.format,
    d.views,
    d.likes,
    d.comments,
    d.shares,
    d.saves,
    d.interactions,
    max(d.activity_date) over (partition by d.account_id)   as data_through,
    a.takeover_date,
    case a.platform when 'tiktok' then 'UTC' else 'America/Los_Angeles' end as day_tz   -- ny
from public.account_daily d
join public.accounts a on a.id = d.account_id
where d.format in ('ALL', 'REELS', 'FEED', 'STORY', 'SHORTS', 'VIDEO');

comment on view dashboard.daily_activity is
    'Aktivitet per konto per døgn per format. day_tz = døgnets tidssone (Stillehavstid for Instagram og '
    'YouTube, UTC for TikTok). data_through = siste døgn med data for kontoen. takeover_date = når Nordbø '
    'Marketing tok over. Sammenlign aldri på tvers av plattformer eller formater.';

-- ---------------------------------------------------------------------------
-- Rettigheter
-- ---------------------------------------------------------------------------
-- Rådata: ingen tilgang for anon/authenticated (gjentas eksplisitt, ingen endring for service_role)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Funksjoner: EXECUTE gis som standard til PUBLIC, som anon og authenticated arver fra.
-- Derfor revokes det også fra PUBLIC, og service_role får EXECUTE eksplisitt tilbake.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Nye objekter i public skal heller ikke gi tilgang automatisk. Standardrettigheter gjelder per
-- rolle som oppretter objektet, så dette gjøres for alle eiere av objekter i public, pluss postgres
-- (rollen SQL Editor kjører som). En rolle vi ikke har lov til å endre (f.eks. supabase_admin)
-- hoppes over med en melding; sjekk-blokk F viser hva som gjenstår.
-- Merk: EXECUTE til PUBLIC på nye funksjoner er en global standard i Postgres og kan ikke fjernes
-- per schema, så den revokes globalt for eierrollen (gjelder funksjoner rollen oppretter i alle schemaer).
do $$
declare
    r record;
begin
    for r in
        select distinct pg_get_userbyid(c.relowner) as owner
        from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S')
        union
        select distinct pg_get_userbyid(p.proowner) from pg_proc p
        where p.pronamespace = 'public'::regnamespace
        union
        select 'postgres'
    loop
        begin
            execute format('alter default privileges for role %I in schema public '
                           'revoke all on tables from anon, authenticated', r.owner);
            execute format('alter default privileges for role %I in schema public '
                           'revoke all on sequences from anon, authenticated', r.owner);
            execute format('alter default privileges for role %I in schema public '
                           'revoke all on functions from anon, authenticated', r.owner);
            execute format('alter default privileges for role %I '
                           'revoke execute on functions from public', r.owner);
            raise notice 'Standardrettigheter strammet inn for rollen %', r.owner;
        exception when insufficient_privilege then
            raise notice 'Hoppet over rollen % (mangler rettighet til å endre den)', r.owner;
        end;
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. followers: følgere per konto per dag (total og brutto nye) med startverdi
-- ---------------------------------------------------------------------------
create or replace view dashboard.followers
with (security_invoker = false) as
select
    a.platform,
    a.id                        as account_id,
    ai.snapshot_date            as day,             -- Instagram/YouTube: Oslo-dato for siste måling;
                                                    -- TikTok: UTC-døgn når ferdig, ellers Oslo-dato
    ai.followers_count,                             -- total (null der den ikke ble målt)
    ai.new_followers,                               -- brutto: Instagram (Meta), YouTube (Analytics), TikTok null
    a.takeover_date,
    a.followers_start,
    a.followers_start_date,
    a.followers_start_source
from public.account_insights ai
join public.accounts a on a.id = ai.account_id
where ai.followers_count is not null or ai.new_followers is not null;

comment on view dashboard.followers is
    'Følgere per konto per dag: total (followers_count) og brutto nye (new_followers), med startverdi fra '
    'accounts. Netto = total ved periodens slutt minus total dagen før periodestart. Summer aldri netto på '
    'tvers av plattformer.';

-- Dashboard: authenticated kan bare lese viewene; anon får ingenting
revoke all on schema dashboard from public, anon, authenticated;
revoke all on all tables in schema dashboard from public, anon, authenticated;
grant usage on schema dashboard to authenticated, service_role;
grant select on dashboard.content_latest, dashboard.concept_summary, dashboard.platform_summary,
    dashboard.daily_activity, dashboard.followers
    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schema tilkobling (TikTok-kobling): det callbacken kaller som innlogget bruker
-- Funksjonene kjører med eierens rettigheter (security definer), men slipper bare gjennom:
--   - en innlogget bruker (auth.uid() er satt)
--   - en gyldig, ubrukt state som ikke er utløpt
--   - lagring bare av den samme brukeren som løste inn staten, innen 15 minutter, én gang
--   - et token som ikke ser ut som klartekst (TikToks refresh-tokens starter med «rft.»)
--   - samme TikTok-konto som før (en konto som allerede er koblet, kan ikke byttes til en annen open_id)
-- Ingen funksjon returnerer tokens.
-- ---------------------------------------------------------------------------
create schema if not exists tilkobling;

revoke all on schema tilkobling from public, anon, authenticated;
grant usage on schema tilkobling to authenticated, service_role;

create or replace function tilkobling.claim_tiktok_state(p_state text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if p_state is null or length(p_state) not between 32 and 128 then
        raise exception 'Ugyldig state';
    end if;

    update public.tiktok_oauth_states
    set used_at = now(), used_by = auth.uid()
    where state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
      and used_at is null
      and expires_at > now()
    returning account_id into v_account_id;

    if v_account_id is null then
        raise exception 'Lenken er ugyldig, utløpt eller allerede brukt. Lag en ny med tiktok_link.py.';
    end if;
    return v_account_id;
end $$;

create or replace function tilkobling.store_tiktok_token(
    p_state                     text,
    p_open_id                   text,
    p_scope                     text[],
    p_refresh_token_enc         text,
    p_refresh_expires_in        integer,
    p_username                  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account_id    bigint;
    v_current_id    text;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if p_open_id is null or length(p_open_id) = 0 then
        raise exception 'Mangler open_id';
    end if;
    if p_refresh_token_enc is null or length(p_refresh_token_enc) < 64 or p_refresh_token_enc like 'rft.%' then
        raise exception 'Tokenet er ikke kryptert';
    end if;

    update public.tiktok_oauth_states
    set stored_at = now()
    where state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
      and used_by = auth.uid()
      and used_at > now() - interval '15 minutes'
      and stored_at is null
    returning account_id into v_account_id;

    if v_account_id is null then
        raise exception 'Ingen gyldig innløst lenke for denne brukeren';
    end if;

    select platform_account_id into v_current_id
    from public.accounts
    where id = v_account_id and platform = 'tiktok'
    for update;

    if v_current_id is null then
        raise exception 'Kontoen finnes ikke eller er ikke en TikTok-konto';
    end if;
    if v_current_id not like 'pending:%' and v_current_id <> p_open_id then
        raise exception 'Kontoen er allerede koblet til en annen TikTok-konto';
    end if;

    update public.accounts
    set platform_account_id = p_open_id,
        username = coalesce(nullif(p_username, ''), username)
    where id = v_account_id;

    insert into public.tiktok_tokens as t
        (account_id, open_id, scope, refresh_token_enc, refresh_expires_at, status,
         authorized_at, authorized_by, last_error, updated_at)
    values
        (v_account_id, p_open_id, coalesce(p_scope, '{}'), p_refresh_token_enc,
         now() + make_interval(secs => coalesce(p_refresh_expires_in, 0)), 'ok',
         now(), auth.uid(), null, now())
    on conflict (account_id) do update set
        open_id            = excluded.open_id,
        scope              = excluded.scope,
        refresh_token_enc  = excluded.refresh_token_enc,
        refresh_expires_at = excluded.refresh_expires_at,
        status             = 'ok',
        authorized_at      = excluded.authorized_at,
        authorized_by      = excluded.authorized_by,
        last_error         = null,
        updated_at         = now();
end $$;

comment on function tilkobling.claim_tiktok_state(text) is
    'Løser inn en engangs-state fra tiktok_link.py. Returnerer account_id. Kalles av /tiktok/callback.';
comment on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text) is
    'Lagrer kryptert refresh-token for kontoen staten gjelder. Samme bruker, innen 15 min, én gang.';

revoke all on function tilkobling.claim_tiktok_state(text) from public, anon, authenticated;
revoke all on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text)
    from public, anon, authenticated;
grant execute on function tilkobling.claim_tiktok_state(text) to authenticated, service_role;
grant execute on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text)
    to authenticated, service_role;

commit;
