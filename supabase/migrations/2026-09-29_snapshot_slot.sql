-- NB (30.09.2026): security_invoker på «latest»-viewet her er overstyrt av
-- 2026-09-30_latest_views_owner_rights.sql (security_invoker = false). Ikke kjør denne filen på nytt
-- uten å kjøre den migreringen etterpå, ellers slutter dashboard-viewene å virke for authenticated.
--
-- NM Insights - migrering 29.09.2026: to øyeblikksbilder per innlegg per dag
--
-- GitHub Actions kjører nå både morgen (07) og kveld (20). Med nøkkelen
-- (post_id, snapshot_date) ville kveldskjøringen overskrevet morgenens tall.
-- Denne migreringen legger snapshot_slot inn i nøkkelen.
--
-- Kjøres i Supabase SQL Editor FØR ny kode tas i bruk. Kan kjøres flere ganger.

begin;

do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'post_insights'
          and column_name = 'snapshot_slot'
    ) then
        -- Eksisterende rader er fra dagtid 29.09.2026 og regnes som morgen
        alter table public.post_insights
            add column snapshot_slot text not null default 'morgen'
            check (snapshot_slot in ('morgen', 'kveld'));
        alter table public.post_insights drop constraint post_insights_pkey;
        alter table public.post_insights add primary key (post_id, snapshot_date, snapshot_slot);
    end if;
end $$;

-- Siste øyeblikksbilde per innlegg: nyeste dato, og nyeste kjøring innen datoen.
-- Kolonnelisten er uendret, bortsett fra snapshot_slot til slutt.
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

revoke all on public.posts_latest from public, anon, authenticated;
grant select on public.posts_latest to service_role;

commit;
