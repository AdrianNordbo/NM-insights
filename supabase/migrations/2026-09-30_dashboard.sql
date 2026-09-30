-- NM Insights - migrering 30.09.2026: datalag for dashboardet (schema dashboard)
--
-- dashboard.content_latest    én rad per innlegg/video på tvers av plattformer (siste måling)
-- dashboard.concept_summary   median per plattform + format + konsept (bare modne innlegg)
-- dashboard.platform_summary  per plattform + format + periode (uke/måned), med forrige periode
--
-- Tilgang:
--   - authenticated får bare USAGE på schemaet dashboard og SELECT på viewene der.
--   - anon og authenticated har ingen rettigheter på tabellene i public (rådata).
--   - Viewene kjører med eierens rettigheter (security_invoker = false). Det er det som gjør at
--     authenticated kan lese de sammenstilte tallene uten å ha tilgang til rådatatabellene.
--
-- Ingen engasjementsrate i disse viewene (plattformene har ulik definisjon og YouTube har ikke
-- rekkevidde per video). Plattformer og formater sammenlignes ikke med hverandre.
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

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
    c.special_event,                                               -- f.eks. VM 2026 får egne rader
    count(*)                                                       as posts,
    percentile_cont(0.5) within group (order by c.views)           as median_views,
    percentile_cont(0.5) within group (order by c.likes)           as median_likes,
    percentile_cont(0.5) within group (order by c.comments)        as median_comments,
    (count(*) < 6)                                                 as preliminary
from dashboard.content_latest c
where c.is_mature
group by c.platform, c.account_id, c.format, c.concept, c.special_event;

comment on view dashboard.concept_summary is
    'Median per plattform + konto + format + konsept + special_event, bare innlegg ≥ 7 dager. '
    'Innhold med special_event (f.eks. VM) får egne rader. preliminary = under 6 innlegg.';

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
