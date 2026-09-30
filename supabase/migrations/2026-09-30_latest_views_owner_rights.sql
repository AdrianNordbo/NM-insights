-- NM Insights - migrering 30.09.2026: «latest»-viewene kjører med eierens rettigheter
--
-- Hvorfor: dashboard-viewene (security_invoker = false) leser public.posts_latest og
-- public.youtube_videos_latest. Når et view med security_invoker = true leses gjennom et annet
-- view, sjekker Postgres de underliggende tabellene som brukeren som kjører spørringen. Da får
-- authenticated «permission denied for table posts» via dashboard.content_latest.
--
-- Løsning: de to viewene kjører med eierens rettigheter, som dashboard-viewene. «Latest»-logikken
-- blir ikke duplisert.
--
-- Konsekvens: viewene omgår RLS for den som har SELECT på dem. Det er bare service_role (som omgår
-- RLS uansett). Revoke for public/anon/authenticated gjentas som sikring.
--
-- NB: Eldre migreringer og schema.sql oppretter viewene med security_invoker = true. Kjøres de på
-- nytt, må denne migreringen også kjøres på nytt (schema.sql oppdateres til false).
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

alter view public.posts_latest          set (security_invoker = false);
alter view public.youtube_videos_latest set (security_invoker = false);

revoke all on public.posts_latest, public.youtube_videos_latest from public, anon, authenticated;
grant select on public.posts_latest, public.youtube_videos_latest to service_role;

commit;
