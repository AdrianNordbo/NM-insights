-- NM Insights: manuelle koblinger Reel → TikTok/YouTube-versjon (lagt inn 16.10.2026).
-- Brukes bare til varighet i dashboard.post_features. Kjøres i SQL Editor; endrer ikke eksisterende rader.
insert into public.reel_links (ig_post_id, tiktok_video_id, youtube_video_id, note) values
  ('18077010758465531', '7654555363471101206', '3paTdg2ozEg', 'rettet: lagt ut 27.06 på TikTok/YouTube'),
  ('18056527859754902', '7654557849074388246', 'SU8XaHmZaSA', 'lagt ut 23.06 på TikTok/YouTube'),
  ('18025678529837434', '7651652827516898582', 'daCnkBwkWWg', 'over 60 min fra Instagram'),
  ('17903698791445061', '7654166796366368022', 'y5_0lwXgSnk', 'over 60 min fra Instagram'),
  ('18106344925999674', '7655262911170071811', 'd4ZMNBOxJwk', 'over 60 min fra Instagram'),
  ('18131892631631845', '7676232276883098902', null,          'over 60 min fra Instagram; YouTube-versjon ikke funnet'),
  ('18160445908503368', '7690981782740634902', 'EQ6YFwqQhY0', 'over 60 min fra Instagram')
on conflict (ig_post_id) do nothing;
