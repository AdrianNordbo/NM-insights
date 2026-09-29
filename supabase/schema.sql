-- NM Insights - databaseskjema
--
-- Tre tabeller:
--   accounts       én rad per kundekonto (f.eks. Veksthuset på Instagram)
--   posts          én rad per innlegg: metadata og konsept (endres sjelden)
--   post_insights  én rad per innlegg per dag: innsiktstall (øyeblikksbilder over tid)
--   account_insights  én rad per konto per dag: følgere og antall innlegg
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
                        check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin')),
    platform_account_id text not null,                 -- IG_USER_ID for Instagram
    username            text,
    timezone            text not null default 'Europe/Oslo',
    concepts_start      date,                          -- innlegg før denne datoen: "Før konsepter"
    active              boolean not null default true, -- false = hentes ikke lenger daglig
    created_at          timestamptz not null default now(),
    unique (platform, platform_account_id)
);

comment on table public.accounts is 'Én rad per kundekonto på én plattform.';

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

    primary key (post_id, snapshot_date)               -- ny kjøring samme dag oppdaterer raden
);

create index if not exists post_insights_date_idx
    on public.post_insights (snapshot_date);

comment on table public.post_insights is 'Én rad per innlegg per dag. Tallene er kumulative per dato.';

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
    i.raw
from public.posts p
left join public.post_insights i on i.post_id = p.id
order by p.id, i.snapshot_date desc;

-- ---------------------------------------------------------------------------
-- Row Level Security: på, uten policies
-- ---------------------------------------------------------------------------
alter table public.accounts      enable row level security;
alter table public.posts         enable row level security;
alter table public.post_insights enable row level security;
alter table public.account_insights enable row level security;

-- ---------------------------------------------------------------------------
-- Rettigheter: eksplisitt, og bare til service_role
-- ---------------------------------------------------------------------------
revoke all on public.accounts, public.posts, public.post_insights, public.account_insights,
    public.posts_latest
    from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.accounts, public.posts, public.post_insights, public.account_insights
    to service_role;
grant select on public.posts_latest to service_role;
-- Identity-kolonner bruker sekvenser; nødvendig for insert
grant usage, select on sequence public.accounts_id_seq, public.posts_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Første kunde
-- ---------------------------------------------------------------------------
insert into public.accounts (client_name, platform, platform_account_id, username, concepts_start)
values ('Veksthuset', 'instagram', '17841450044968553', 'veksthusene', '2026-06-15')
on conflict (platform, platform_account_id) do nothing;

commit;
