-- NM Insights - migrering 30.09.2026: median_engagement_per_view i dashboard.concept_summary
--
-- Ny kolonne (lagt til sist, som create or replace view krever): median av
-- (likes + comments) / views per innlegg, bare modne innlegg (som resten av viewet).
-- Innlegg med 0 visninger telles ikke med (nullif).
--
-- Kolonnen skal bare sammenlignes innenfor samme plattform og format. Den er ikke den samme som
-- engasjementsraten i Instagram-rapporten (total_interactions / reach).
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

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

-- Rettighetene beholdes ved create or replace, men gjentas eksplisitt
revoke all on dashboard.concept_summary from public, anon;
grant select on dashboard.concept_summary to authenticated, service_role;

commit;
