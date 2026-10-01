-- NM Insights - migrering 01.10.2026: daglig aktivitet per konto og format + overtakelsesdato
--
-- public.account_daily        én rad per konto per døgn per format: visninger, likes, kommentarer,
--                             delinger, lagringer og interaksjoner for hele kontoen (også eldre innlegg)
-- public.accounts             ny kolonne takeover_date (når Nordbø Marketing tok over kontoen)
-- dashboard.daily_activity    det dashboardet leser, med data_through og takeover_date
--
-- Døgn: både Meta og YouTube Analytics teller døgn i Stillehavstid (America/Los_Angeles).
-- activity_date er det døgnet, ikke Oslo-døgnet.
--
-- Format:
--   Instagram (Metas media_product_type-breakdown):
--     ALL     hele kontoen (Metas totalverdi)
--     REELS   REEL
--     FEED    POST + CAROUSEL_CONTAINER + CAROUSEL_ITEM (bilder og karuseller)
--     STORY   STORY
--     AD      visninger og interaksjoner via annonser
--     OTHER   alt annet Meta rapporterer (f.eks. DEFAULT_DO_NOT_USE)
--   YouTube (Analytics creatorContentType):
--     ALL     hele kanalen
--     SHORTS  shorts
--     VIDEO   videoOnDemand
--     LIVE    liveStream
--     OTHER   alt annet
--
-- interactions: Instagram = Metas total_interactions (kan være litt høyere enn summen av likes,
-- kommentarer, delinger og lagringer, fordi Meta også teller f.eks. svar). YouTube = likes +
-- comments + shares (YouTube har ingen samlet interaksjonsmetrikk). saves finnes ikke for YouTube (null).
-- Tallene skal aldri sammenlignes på tvers av plattformer eller formater.
--
-- Tilgang som for resten: rådatatabellen bare for service_role, viewet i dashboard for authenticated.
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

-- ---------------------------------------------------------------------------
-- 1. Overtakelsesdato på kontoen
-- ---------------------------------------------------------------------------
alter table public.accounts add column if not exists takeover_date date;

comment on column public.accounts.takeover_date is
    'Datoen Nordbø Marketing tok over kontoen. Vises som markering i dashboardets grafer.';

update public.accounts
set takeover_date = date '2026-06-15'
where client_name = 'Veksthuset';

-- ---------------------------------------------------------------------------
-- 2. Daglig aktivitet per konto og format
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
    interactions    bigint,                        -- se kommentaren øverst
    raw             jsonb,                         -- API-verdiene raden er bygget av
    fetched_at      timestamptz not null default now(),
    primary key (account_id, activity_date, format) -- ny henting av samme døgn oppdaterer raden
);

create index if not exists account_daily_date_idx on public.account_daily (activity_date);

comment on table public.account_daily is
    'Én rad per konto per døgn (Stillehavstid) per format: aktivitet på hele kontoen, også eldre innlegg. '
    'Instagram fra Meta (media_product_type), YouTube fra Analytics (creatorContentType).';

alter table public.account_daily enable row level security;

revoke all on public.account_daily from public, anon, authenticated;
grant select, insert, update, delete on public.account_daily to service_role;

-- ---------------------------------------------------------------------------
-- 3. dashboard.daily_activity
-- data_through = siste døgn med data for kontoen (YouTube ligger 2–3 døgn etter).
-- Bare formatene dashboardet bruker eller kan trenge; AD og OTHER holdes utenfor.
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
    a.takeover_date
from public.account_daily d
join public.accounts a on a.id = d.account_id
where d.format in ('ALL', 'REELS', 'FEED', 'STORY', 'SHORTS', 'VIDEO');

comment on view dashboard.daily_activity is
    'Aktivitet per konto per døgn (Stillehavstid) per format. data_through = siste døgn med data for kontoen. '
    'takeover_date = når Nordbø Marketing tok over. Sammenlign aldri på tvers av plattformer eller formater.';

-- ---------------------------------------------------------------------------
-- Rettigheter: authenticated kan bare lese viewet; anon får ingenting
-- ---------------------------------------------------------------------------
revoke all on dashboard.daily_activity from public, anon, authenticated;
grant select on dashboard.daily_activity to authenticated, service_role;

commit;
