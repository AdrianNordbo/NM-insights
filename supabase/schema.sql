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
    (p.published_at <= now() - interval '7 days')                as is_mature
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
    (y.published_at <= now() - interval '7 days')
from public.youtube_videos_latest y
where y.format = 'SHORTS';                                                            -- VIDEO holdes utenfor

comment on view dashboard.content_latest is
    'Én rad per innlegg/video (siste måling). YouTube: Data API-tall, bare SHORTS. published_at i Europe/Oslo.';

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

-- Dashboard: authenticated kan bare lese viewene; anon får ingenting
revoke all on schema dashboard from public, anon, authenticated;
revoke all on all tables in schema dashboard from public, anon, authenticated;
grant usage on schema dashboard to authenticated, service_role;
grant select on dashboard.content_latest, dashboard.concept_summary, dashboard.platform_summary
    to authenticated, service_role;

commit;
