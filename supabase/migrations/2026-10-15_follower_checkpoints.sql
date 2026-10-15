-- NM Insights - migrering 15.10.2026: kontrollpunkter for følgere og dashboard.follower_points
--
-- public.follower_checkpoints   følgertall per konto ved slutten av en dag, regnet fra avleste månedstall i
--                               Meta Insikt / TikTok Studio. Aldri målt av API-et. Skrives manuelt (insert
--                               nederst), aldri av hentingen. account_insights røres ikke.
-- dashboard.follower_points     ett punkt per konto per dag med type:
--                                 målt          account_insights.followers_count (API-et)
--                                 kontrollpunkt follower_checkpoints (regnet fra Meta Insikt / TikTok Studio)
--                                 beregnet      YouTube: nye − tapte abonnenter fra YouTube Analytics (raw),
--                                               summert fra 04.06, bare for døgn før første måling (30.09).
--                                               Overgangen er kontrollert: 28.09 = 29.09 = 30.09 = 39.
--                               Prioritet samme dag: målt > kontrollpunkt > beregnet. source = kilden
--                               (UI-etiketten bygges fra den).
--
-- Bakoverkompatibelt: bare ny tabell og nytt view. dashboard.followers og alle andre views er uendret.
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

create table if not exists public.follower_checkpoints (
    account_id  bigint  not null references public.accounts (id) on delete cascade,
    day         date    not null,           -- totalen gjelder ved SLUTTEN av denne dagen
    followers   integer not null check (followers >= 0),
    source      text    not null,           -- f.eks. 'Meta Insikt (beregnet)', 'TikTok Studio (beregnet)'
    method      text,                       -- hvordan tallet er regnet fra de avleste månedstallene
    read_at     date    not null,           -- når månedstallene ble lest av
    created_at  timestamptz not null default now(),
    primary key (account_id, day)
);

comment on table public.follower_checkpoints is
    'Følgertall ved slutten av en dag, regnet fra avleste månedstall (Meta Insikt, TikTok Studio). Aldri målt '
    'av API-et; vises som «beregnet fra …». Kan avvike med noen få følgere.';

alter table public.follower_checkpoints enable row level security;
revoke all on public.follower_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on public.follower_checkpoints to service_role;

create or replace view dashboard.follower_points
with (security_invoker = false) as
with measured as (
    select ai.account_id, ai.snapshot_date as day, ai.followers_count as total
    from public.account_insights ai
    where ai.followers_count is not null
),
first_measured as (
    select account_id, min(day) as day from measured group by account_id
),
yt_derived as (
    select ai.account_id,
           ai.snapshot_date as day,
           sum(coalesce((ai.raw->>'subscribers_gained')::int, 0) - coalesce((ai.raw->>'subscribers_lost')::int, 0))
               over (partition by ai.account_id order by ai.snapshot_date) as total
    from public.account_insights ai
    join public.accounts a on a.id = ai.account_id and a.platform = 'youtube'
    where ai.raw->>'source' = 'youtube_analytics_subscribers'
)
select a.platform, m.account_id, m.day, m.total::integer as total,
       'målt'::text as kind, null::text as source, null::date as read_at
from measured m
join public.accounts a on a.id = m.account_id
union all
select a.platform, c.account_id, c.day, c.followers,
       'kontrollpunkt', c.source, c.read_at
from public.follower_checkpoints c
join public.accounts a on a.id = c.account_id
where not exists (select 1 from measured m where m.account_id = c.account_id and m.day = c.day)
union all
select a.platform, y.account_id, y.day, y.total::integer,
       'beregnet', 'YouTube Analytics (beregnet)', null
from yt_derived y
join public.accounts a on a.id = y.account_id
join first_measured f on f.account_id = y.account_id
where y.day < f.day
  and not exists (select 1 from public.follower_checkpoints c where c.account_id = y.account_id and c.day = y.day);

comment on view dashboard.follower_points is
    'Følgertall per konto per dag med type: målt (API) > kontrollpunkt (regnet fra Meta Insikt / TikTok Studio) '
    '> beregnet (YouTube Analytics før første måling). Aldri vis kontrollpunkt eller beregnet som målt.';

revoke all on dashboard.follower_points from public, anon;
grant select on dashboard.follower_points to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Kontrollpunkter: egne setninger, kjøres når tallene er bekreftet. Totalen ved slutten av dagen.
-- Instagram (konto 1): startverdi 339 per 15.06 + nye − sluttet fra Meta Insikt.
-- TikTok (konto 3): regnet bakover fra målt 199 per 31.08 med netto fra TikTok Studio
-- (august +65, juli +49). TikTok 31.08 er målt og trenger ikke kontrollpunkt.
-- ---------------------------------------------------------------------------
-- insert into public.follower_checkpoints (account_id, day, followers, source, method, read_at) values
--   (1, '2026-06-30', 374, 'Meta Insikt (beregnet)',   '339 + 37 nye − 2 sluttet (15.–30.06)',        '2026-10-15'),
--   (1, '2026-07-31', 427, 'Meta Insikt (beregnet)',   '374 + 56 nye − 3 sluttet (juli)',              '2026-10-15'),
--   (1, '2026-08-31', 464, 'Meta Insikt (beregnet)',   '427 + 45 nye − 8 sluttet (august)',            '2026-10-15'),
--   (3, '2026-06-30',  85, 'TikTok Studio (beregnet)', '134 − 49 (netto juli)',                        '2026-10-15'),
--   (3, '2026-07-31', 134, 'TikTok Studio (beregnet)', '199 (målt 31.08) − 65 (netto august)',         '2026-10-15')
-- on conflict (account_id, day) do nothing;
