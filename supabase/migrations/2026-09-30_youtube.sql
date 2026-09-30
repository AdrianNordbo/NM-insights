-- NB (30.09.2026): security_invoker på «latest»-viewet her er overstyrt av
-- 2026-09-30_latest_views_owner_rights.sql (security_invoker = false). Ikke kjør denne filen på nytt
-- uten å kjøre den migreringen etterpå, ellers slutter dashboard-viewene å virke for authenticated.
--
-- NM Insights - migrering 30.09.2026: YouTube (Shorts)
--
-- 1. accounts tillater platform 'youtube', og Veksthusets kanal legges inn
-- 2. youtube_videos: én rad per video (metadata, format, konsept)
-- 3. youtube_video_insights: én rad per video per dag og slot (morgen/kveld)
--    - views, likes, comments: Data API, sanntid ved fetched_at (hovedtall)
--    - a_* og dype mål: Analytics, kumulativt til og med analytics_end_date (2–3 dager bak)
--    - shares, subscribers_*: per-video-kall, bare siste 30 dager på vanlige kjøringer
--      og alle videoer én gang i uken. null betyr «ikke hentet i denne kjøringen».
-- 4. youtube_video_daily: Analytics per video per døgn (Stillehavstid), for historikk
--    bakover fra publisering og sammenligning på samme alder
-- 5. Visningen youtube_videos_latest
-- Kanaltall (abonnenter, videoer) går i account_insights, som er generisk per konto.
--
-- Rettigheter som resten av skjemaet: RLS på uten policies, bare service_role.
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

-- ---------------------------------------------------------------------------
-- 1. accounts: YouTube som plattform + Veksthusets kanal
-- ---------------------------------------------------------------------------
alter table public.accounts drop constraint if exists accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check
    check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'));

-- Sikring: hvis den gamle constrainten hadde et annet navn, finnes det nå to
-- platform-constraints. Da avbrytes hele migreringen (ingenting endres).
do $$
begin
    if (select count(*) from pg_constraint
        where conrelid = 'public.accounts'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%platform%') <> 1 then
        raise exception 'Uventet antall platform-constraints på accounts. Migreringen avbrytes.';
    end if;
end $$;

insert into public.accounts (client_name, platform, platform_account_id, username, concepts_start)
values ('Veksthuset', 'youtube', 'UChv7DsnM326j78XEZBWyTPg', 'Veksthuset', '2026-06-15')
on conflict (platform, platform_account_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Videoer
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
-- 3. Øyeblikksbilder per video (to per dag)
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
-- 4. Daglig Analytics per video (historikk og samme alder)
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
-- 5. Siste tall per video
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
-- Row Level Security og rettigheter: bare service_role
-- ---------------------------------------------------------------------------
alter table public.youtube_videos         enable row level security;
alter table public.youtube_video_insights enable row level security;
alter table public.youtube_video_daily    enable row level security;

revoke all on public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily,
    public.youtube_videos_latest
    from public, anon, authenticated;

grant select, insert, update, delete
    on public.youtube_videos, public.youtube_video_insights, public.youtube_video_daily
    to service_role;
grant select on public.youtube_videos_latest to service_role;
grant usage, select on sequence public.youtube_videos_id_seq to service_role;

commit;
