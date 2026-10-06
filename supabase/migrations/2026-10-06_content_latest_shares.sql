-- NM Insights - migrering 06.10.2026: shares (delinger) i dashboard.content_latest
--
-- Ny kolonne bakerst (create or replace view krever at eksisterende kolonner beholder navn, type og
-- rekkefølge). Ingen andre endringer: concept_summary og platform_summary bygger på viewet og påvirkes ikke,
-- og eksisterende spørringer som ikke ber om shares, får samme svar som før.
--
--   shares  Instagram: delinger fra nyeste måling i posts_latest (Metas «shares» per innlegg).
--           YouTube: delinger fra per-video-Analytics (youtube_videos_latest, nyeste måling der de ble
--           hentet). null der tallet mangler (ikke hentet ennå), aldri 0 som erstatning.
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
    p.shares::bigint                                             as shares          -- ny: delinger
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
    y.shares::bigint                                                                  -- per-video-Analytics, null der det mangler
from public.youtube_videos_latest y
where y.format = 'SHORTS';                                                            -- VIDEO holdes utenfor

comment on view dashboard.content_latest is
    'Én rad per innlegg/video (siste måling). YouTube: Data API-tall, bare SHORTS. published_at i Europe/Oslo. '
    'title = første linje av captionen (Instagram) eller videotittelen (YouTube). fetched_at er timestamptz. '
    'shares: Instagram fra posts_latest, YouTube fra per-video-Analytics; null der tallet mangler.';

-- Rettighetene beholdes ved create or replace, men gjentas eksplisitt
revoke all on dashboard.content_latest from public, anon;
grant select on dashboard.content_latest to authenticated, service_role;

commit;
