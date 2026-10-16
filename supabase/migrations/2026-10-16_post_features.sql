-- NM Insights 16.10.2026: reel_links + dashboard.post_features. Kjørt av Adrian i SQL Editor 16.10.2026.
-- Manuelle rader i reel_links (7 stk.) er lagt inn separat og står ikke her.
begin;

create table if not exists public.reel_links (
    ig_post_id        text primary key,                 -- posts.platform_post_id (Instagram Reel)
    tiktok_video_id   text,                             -- tiktok_videos.platform_video_id
    youtube_video_id  text,                             -- youtube_videos.platform_video_id
    no_match          boolean not null default false,   -- true = finnes ikke på TikTok/YouTube
    note              text,
    set_at            date not null default current_date
);
comment on table public.reel_links is
    'Manuell kobling Reel → TikTok/YouTube-versjon. Går alltid foran den automatiske koblingen. Brukes bare til varighet.';
alter table public.reel_links enable row level security;
revoke all on public.reel_links from public, anon, authenticated;
grant select, insert, update, delete on public.reel_links to service_role;

create or replace view dashboard.post_features
with (security_invoker = false) as
with ig as (
    select p.account_id, p.platform_post_id, p.published_at, p.concept, p.special_event, p.hashtags, p.caption,
           p.views, p.likes, p.comments, p.shares, p.saved, p.reach,
           a.client_name,
           (l.ig_post_id is not null)  as manual,
           coalesce(l.no_match, false) as no_match,
           l.tiktok_video_id           as m_tt,
           l.youtube_video_id          as m_yt
    from public.posts_latest p
    join public.accounts a on a.id = p.account_id
    left join public.reel_links l on l.ig_post_id = p.platform_post_id
    where p.media_product_type = 'REELS'
      and coalesce(p.concept, '') <> 'Bankinfo'
),
tt_auto as (    -- samme kunde, samme konsept, publisert innen 60 min; brukes bare når treffet er entydig
    select ig.platform_post_id, min(t.platform_video_id) as video_id, count(*) as n
    from ig
    join public.tiktok_videos t
      on t.concept = ig.concept and abs(extract(epoch from (t.published_at - ig.published_at))) <= 3600
    join public.accounts ta on ta.id = t.account_id and ta.client_name = ig.client_name
    group by ig.platform_post_id
),
yt_auto as (
    select ig.platform_post_id, min(y.platform_video_id) as video_id, count(*) as n
    from ig
    join public.youtube_videos y
      on y.concept = ig.concept and abs(extract(epoch from (y.published_at - ig.published_at))) <= 3600
    join public.accounts ya on ya.id = y.account_id and ya.client_name = ig.client_name
    group by ig.platform_post_id
),
linked as (     -- manuell rad går alltid foran
    select ig.*,
           case when ig.manual then ig.m_tt when ta.n = 1 then ta.video_id end as tt_id,
           case when ig.manual then ig.m_yt when ya.n = 1 then ya.video_id end as yt_id
    from ig
    left join tt_auto ta on ta.platform_post_id = ig.platform_post_id
    left join yt_auto ya on ya.platform_post_id = ig.platform_post_id
),
dur as (
    select l.*, t.duration_s as tt_dur, y.duration_s::numeric as yt_dur
    from linked l
    left join public.tiktok_videos t  on t.platform_video_id = l.tt_id and not l.no_match
    left join public.youtube_videos y on y.platform_video_id = l.yt_id and not l.no_match
)
select
    'instagram'::text                                                         as platform,
    d.account_id,
    d.platform_post_id                                                        as content_id,
    'REELS'::text                                                             as format,
    d.concept,
    d.special_event,
    (d.published_at at time zone 'Europe/Oslo')                               as published_at,
    extract(isodow from d.published_at at time zone 'Europe/Oslo')::int       as weekday,   -- 1 = mandag
    extract(hour   from d.published_at at time zone 'Europe/Oslo')::int       as hour,
    coalesce(cardinality(d.hashtags), 0)                                      as hashtag_count,
    d.hashtags,
    char_length(btrim(regexp_replace(coalesce(d.caption, ''), '#\S+', '', 'g'))) as text_length,
    coalesce(d.tt_dur, d.yt_dur)                                              as duration_s,
    case when d.tt_dur is not null then 'TikTok-versjonen'
         when d.yt_dur is not null then 'YouTube-versjonen' end               as duration_source,
    case when d.tt_dur is null and d.yt_dur is null then null
         when d.manual then 'manuell' else 'automatisk' end                   as duration_link,
    d.tt_id                                                                   as linked_tiktok_id,
    d.yt_id                                                                   as linked_youtube_id,
    d.views::bigint                                                           as views,
    d.likes::bigint                                                           as likes,
    d.comments::bigint                                                        as comments,
    d.shares::bigint                                                          as shares,
    d.saved::bigint                                                           as saves,
    d.reach::bigint                                                           as reach,
    round((extract(epoch from (now() - d.published_at)) / 86400)::numeric, 1) as age_days,
    (d.published_at <= now() - interval '7 days')                             as is_mature
from dur d
union all
select
    'youtube'::text,
    y.account_id,
    y.platform_video_id,
    y.format,
    y.concept,
    y.special_event,
    (y.published_at at time zone 'Europe/Oslo'),
    extract(isodow from y.published_at at time zone 'Europe/Oslo')::int,
    extract(hour   from y.published_at at time zone 'Europe/Oslo')::int,
    coalesce(cardinality(y.hashtags), 0),
    y.hashtags,
    char_length(coalesce(y.title, '')),
    y.duration_s::numeric,
    case when y.duration_s is not null then 'egen' end,
    null::text, null::text, null::text,
    y.views,
    y.likes::bigint,
    y.comments::bigint,
    y.shares::bigint,
    null::bigint,
    null::bigint,
    round((extract(epoch from (now() - y.published_at)) / 86400)::numeric, 1),
    (y.published_at <= now() - interval '7 days')
from public.youtube_videos_latest y
where y.format = 'SHORTS'
  and coalesce(y.concept, '') <> 'Bankinfo'
union all
select
    'tiktok'::text,
    t.account_id,
    t.platform_video_id,
    t.media_type,
    t.concept,
    t.special_event,
    (t.published_at at time zone 'Europe/Oslo'),
    extract(isodow from t.published_at at time zone 'Europe/Oslo')::int,
    extract(hour   from t.published_at at time zone 'Europe/Oslo')::int,
    coalesce(cardinality(t.hashtags), 0),
    t.hashtags,
    char_length(btrim(regexp_replace(coalesce(t.caption, ''), '#\S+', '', 'g'))),
    t.duration_s,
    case when t.duration_s is not null then 'egen' end,
    null::text, null::text, null::text,
    t.views,
    t.likes::bigint,
    t.comments::bigint,
    t.shares::bigint,
    t.favorites::bigint,
    t.reach::bigint,
    round((extract(epoch from (now() - t.published_at)) / 86400)::numeric, 1),
    (t.published_at <= now() - interval '7 days')
from public.tiktok_videos_latest t
where coalesce(t.concept, '') <> 'Bankinfo';

comment on view dashboard.post_features is
    'Én rad per innlegg til analysen: Instagram bare Reels, Bankinfo utelatt. Ukedag/time i Oslo-tid. '
    'Varighet for Reels hentet fra TikTok/YouTube-versjonen (duration_source), bare som egenskap ved videoen; '
    'aldri til sammenligning av visninger på tvers av plattformer. special_event filtreres i analysen.';

revoke all on dashboard.post_features from public, anon;
grant select on dashboard.post_features to authenticated, service_role;

commit;
