-- NM Insights - migrering 30.09.2026: title, permalink og fetched_at i dashboard.content_latest
--
-- Nye kolonner legges bakerst (create or replace view krever at eksisterende kolonner beholder navn,
-- type og rekkefølge). concept_summary og platform_summary bygger på viewet og påvirkes ikke.
--
--   title      Instagram: første linje av captionen (maks 200 tegn, tom linje blir null).
--              YouTube: videotittelen.
--   permalink  lenke til innlegget/videoen på plattformen.
--   fetched_at når tallene i raden ble hentet (timestamptz; vises i Europe/Oslo i frontend).
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
    p.fetched_at
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
    y.fetched_at
from public.youtube_videos_latest y
where y.format = 'SHORTS';                                                            -- VIDEO holdes utenfor

comment on view dashboard.content_latest is
    'Én rad per innlegg/video (siste måling). YouTube: Data API-tall, bare SHORTS. published_at i Europe/Oslo. '
    'title = første linje av captionen (Instagram) eller videotittelen (YouTube). fetched_at er timestamptz.';

-- Rettighetene beholdes ved create or replace, men gjentas eksplisitt
revoke all on dashboard.content_latest from public, anon;
grant select on dashboard.content_latest to authenticated, service_role;

commit;
