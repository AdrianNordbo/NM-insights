-- NM Insights - kontroll av tallene i dashboard-viewene. Kjør hver blokk for seg. Endrer ingen data.

-- 1. Rader per plattform og format i content_latest. Forventet: ingen rad med format VIDEO.
select platform, format, count(*) as rows, count(*) filter (where is_mature) as mature
from dashboard.content_latest
group by platform, format
order by platform, format;

-- 1b. YouTube-videoer med format VIDEO som er holdt utenfor (skal være 2, og 0 av dem i content_latest).
select (select count(*) from public.youtube_videos_latest where format = 'VIDEO') as video_in_source,
       (select count(*) from dashboard.content_latest where format = 'VIDEO')     as video_in_dashboard;

-- 2. concept_summary for Veksthuset, sortert på plattform, format og median_views.
select s.platform, s.format, s.concept, s.special_event, s.posts,
       round(s.median_views::numeric) as median_views,
       round(s.median_likes::numeric, 1) as median_likes,
       round(s.median_comments::numeric, 1) as median_comments,
       s.preliminary
from dashboard.concept_summary s
join public.accounts a on a.id = s.account_id
where a.client_name = 'Veksthuset'
order by s.platform, s.format, s.median_views desc;

-- 3. Siste to komplette uker og måneder fra platform_summary.
select platform, format, period_type, period_start, period_end, published, mature_posts,
       round(median_views::numeric) as median_views, new_followers, days_with_follower_data,
       followers_end, prev_published, round(prev_median_views::numeric) as prev_median_views,
       prev_new_followers
from (
    select p.*, row_number() over (partition by platform, format, period_type
                                   order by period_start desc) as rn
    from dashboard.platform_summary p
    where period_complete
) x
where rn <= 2
order by platform, format, period_type, period_start desc;
