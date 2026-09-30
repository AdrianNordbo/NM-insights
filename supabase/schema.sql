-- NM Insights - databaseskjema
--
-- Tre tabeller:
--   accounts       én rad per kundekonto (f.eks. Veksthuset på Instagram)
--   posts          én rad per innlegg: metadata og konsept (endres sjelden)
--   post_insights  én rad per innlegg per dag: innsiktstall (øyeblikksbilder over tid)
--   account_insights  én rad per konto per dag: følgere og antall innlegg
--   youtube_videos, youtube_video_insights, youtube_video_daily  YouTube (se egne seksjoner)
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
-- security_invoker: visningen følger rettighetene og RLS til den som spør.
-- ---------------------------------------------------------------------------
create or replace view public.posts_latest
with (security_invoker = true) as
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
with (security_invoker = true) as
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
-- Row Level Security: på, uten policies
-- ---------------------------------------------------------------------------
alter table public.accounts      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_insights enable row level security;
alter table public.account_insights enable row level security;
alter table public.youtube_videos         enable row level security;
alter table public.youtube_video_insights enable row level security;
alter table public.youtube_video_daily    enable row level security;

-- ---------------------------------------------------------------------------
-- Rettigheter: eksplisitt, og bare til service_role
-- ---------------------------------------------------------------------------
revoke all on public.accounts, public.posts, public.post_insights, public.account_insights,
    public.posts_latest,
    public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily,
    public.youtube_videos_latest
    from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.accounts, public.posts, public.post_insights, public.account_insights,
       public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily
    to service_role;
grant select on public.posts_latest, public.youtube_videos_latest to service_role;
-- Identity-kolonner bruker sekvenser; nødvendig for insert
grant usage, select on sequence public.accounts_id_seq, public.posts_id_seq,
    public.youtube_videos_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Første kunde
-- ---------------------------------------------------------------------------
insert into public.accounts (client_name, platform, platform_account_id, username, concepts_start)
values ('Veksthuset', 'instagram', '17841450044968553', 'veksthusene', '2026-06-15'),
       ('Veksthuset', 'youtube', 'UChv7DsnM326j78XEZBWyTPg', 'Veksthuset', '2026-06-15')
on conflict (platform, platform_account_id) do nothing;

commit;
