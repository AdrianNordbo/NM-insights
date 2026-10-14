-- NM Insights - migrering 14.10.2026: TikTok i dashboard-viewene (steg C)
--
-- dashboard.content_latest   ny tredje UNION-gren for TikTok (fra public.tiktok_videos_latest), og ny
--                            kolonne bakerst: pending.
-- dashboard.daily_activity   ny kolonne bakerst: day_tz (døgnets tidssone per plattform).
--
-- Bakoverkompatibelt: create or replace view beholder eksisterende kolonner (navn, type, rekkefølge);
-- de nye kolonnene ligger bakerst. Instagram- og YouTube-radene er uendret (pending = false).
-- concept_summary og platform_summary bygger på content_latest og får TikTok-rader automatisk
-- (platform 'tiktok', format VIDEO/PHOTO). platform_summary henter følgere fra account_insights (konto 3:
-- følgertotal per døgn, new_followers null fordi kontoen ikke er Business).
--
-- TikTok i content_latest:
--   views     = video_views (levetid, kan inneholde betalt visning; Veksthuset har ingen is_ad-innlegg)
--   likes, comments, shares fra nyeste måling
--   format    = media_type (VIDEO eller PHOTO); sammenlignes aldri med Instagram/YouTube-formater
--   title     = første linje av captionen uten hashtags bakerst (TikTok-captions er ofte én linje med
--               hashtags til slutt), permalink = share_url uten utm-parametere
--   pending   = true når TikTok ikke har behandlet tallene ennå: innlegget er yngre enn 7 dager og har
--               0 visninger eller ingen måling med rekkevidde (reach 0 med visninger lagres som null).
--               Dashboardet viser da «venter på TikTok» i stedet for tallene.
--
-- daily_activity.day_tz: 'America/Los_Angeles' for Instagram og YouTube, 'UTC' for TikTok.
--
-- VIKTIG rekkefølge: kjør denne først etter at dashboard-koden som kjenner plattformen 'tiktok', er i
-- produksjon. Eldre kode viser ellers TikTok-rader uten navn.
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

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
    (p.published_at <= now() - interval '7 days')                as is_mature,
    left(nullif(btrim(split_part(coalesce(p.caption, ''), E'\n', 1)), ''), 200) as title,
    p.permalink,
    p.fetched_at,
    p.shares::bigint                                             as shares,
    false                                                        as pending         -- ny
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
    (y.published_at <= now() - interval '7 days'),
    y.title,
    y.permalink,
    y.fetched_at,
    y.shares::bigint,                                                                 -- per-video-Analytics, null der det mangler
    false
from public.youtube_videos_latest y
where y.format = 'SHORTS'                                                             -- VIDEO holdes utenfor
union all
select
    'tiktok'::text,
    t.account_id,
    t.platform_video_id,
    (t.published_at at time zone 'Europe/Oslo'),
    t.media_type,                                                                     -- VIDEO / PHOTO
    t.concept,
    t.special_event,
    t.views,                                                                          -- video_views, levetid
    t.likes::bigint,
    t.comments::bigint,
    round((extract(epoch from (now() - t.published_at)) / 86400)::numeric, 1),
    (t.published_at <= now() - interval '7 days'),
    left(nullif(btrim(regexp_replace(split_part(coalesce(t.caption, ''), E'\n', 1),
                                     '(\s*#\S+)+\s*$', '')), ''), 200),             -- uten hashtags bakerst
    t.permalink,
    t.fetched_at,
    t.shares::bigint,
    (t.published_at > now() - interval '7 days'
     and (coalesce(t.views, 0) = 0 or t.deep_snapshot_date is null))                  -- ikke behandlet ennå
from public.tiktok_videos_latest t;

comment on view dashboard.content_latest is
    'Én rad per innlegg/video (siste måling). YouTube: Data API-tall, bare SHORTS. TikTok: levetidstall '
    '(video_views, kan inneholde betalt visning), format VIDEO/PHOTO. published_at i Europe/Oslo. '
    'title = første linje av captionen (Instagram, TikTok) eller videotittelen (YouTube). fetched_at er '
    'timestamptz. shares: null der tallet mangler. pending = TikTok har ikke behandlet tallene ennå.';

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
    a.takeover_date,
    case a.platform when 'tiktok' then 'UTC' else 'America/Los_Angeles' end as day_tz   -- ny
from public.account_daily d
join public.accounts a on a.id = d.account_id
where d.format in ('ALL', 'REELS', 'FEED', 'STORY', 'SHORTS', 'VIDEO');

comment on view dashboard.daily_activity is
    'Aktivitet per konto per døgn per format. day_tz = døgnets tidssone (Stillehavstid for Instagram og '
    'YouTube, UTC for TikTok). data_through = siste døgn med data for kontoen. takeover_date = når Nordbø '
    'Marketing tok over. Sammenlign aldri på tvers av plattformer eller formater.';

-- Rettighetene beholdes ved create or replace, men gjentas eksplisitt
revoke all on dashboard.content_latest, dashboard.daily_activity from public, anon;
grant select on dashboard.content_latest, dashboard.daily_activity to authenticated, service_role;

commit;
