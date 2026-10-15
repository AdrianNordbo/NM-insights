-- NM Insights - migrering 15.10.2026: følgere (netto per periode og startverdi)
--
-- public.accounts      nye kolonner (nullable): followers_start, followers_start_date, followers_start_source
--                      followers_start = antall følgere/abonnenter ved STARTEN av followers_start_date
--                      (= ved utgangen av dagen før). Netto i en periode regnes som F(slutt) − F(dagen før
--                      periodestart); startverdien brukes som F(followers_start_date − 1 dag).
-- dashboard.followers  nytt view: én rad per konto per dag med followers_count (total) og new_followers
--                      (brutto: Instagram fra Meta, YouTube fra Analytics, TikTok null), pluss startverdien.
--
-- Bakoverkompatibelt: bare nye kolonner og et nytt view. Ingen eksisterende objekter endres.
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

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

revoke all on dashboard.followers from public, anon;
grant select on dashboard.followers to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Startverdier: egne setninger, kjøres bare når tallet er kjent.
-- ---------------------------------------------------------------------------
-- YouTube (konto 2): 0 abonnenter ved starten av 15.06, beregnet fra YouTube Analytics
-- (nye 0 − tapte 0 fra 04.06 til og med 14.06; kontroll: summen t.o.m. 29.09 = 39 = Data API 30.09).
-- Godkjent av Adrian 15.10.2026.
-- update public.accounts
--    set followers_start = 0, followers_start_date = date '2026-06-15',
--        followers_start_source = 'YouTube Analytics (nye − tapte 04.06–14.06)'
--  where id = 2 and platform = 'youtube';
--
-- Instagram (konto 1): sett inn tallet fra Meta Insikt før du kjører (mangler foreløpig).
-- update public.accounts
--    set followers_start = <antall>, followers_start_date = date '2026-06-15',
--        followers_start_source = 'manuelt (Meta Insikt)'
--  where id = 1 and platform = 'instagram';
--
-- TikTok (konto 3): sett inn tallet fra TikTok Studio før du kjører (mangler foreløpig).
-- update public.accounts
--    set followers_start = <antall>, followers_start_date = date '2026-06-15',
--        followers_start_source = 'manuelt (TikTok Studio)'
--  where id = 3 and platform = 'tiktok';
