-- NM Insights - kontroll av tilgang etter 2026-09-30_dashboard.sql, 2026-10-01_account_daily.sql,
-- 2026-10-13_tiktok.sql, 2026-10-14_tiktok_dashboard.sql, 2026-10-15_followers.sql,
-- 2026-10-15_follower_checkpoints.sql og 2026-10-16_post_features.sql
-- Kjør hver blokk for seg i Supabase SQL Editor. Ingen blokk endrer data.

-- A. Hvem kan bruke hva (anon/authenticated). Forventet: allowed = true BARE for authenticated
--    på de seks dashboard-viewene (select); false for alle tabeller, views, sekvenser og
--    funksjoner i public, og for alt for anon.
select r.rolname as role, o.kind, o.obj,
       case o.kind
           when 'function' then has_function_privilege(r.rolname, o.obj, 'execute')
           when 'sequence' then has_sequence_privilege(r.rolname, o.obj, 'usage')
           else has_table_privilege(r.rolname, o.obj, 'select')
       end as allowed
from pg_roles r
cross join (
    select 'table' as kind, schemaname || '.' || tablename as obj from pg_tables where schemaname = 'public'
    union all
    select 'view', schemaname || '.' || viewname from pg_views where schemaname in ('public', 'dashboard')
    union all
    select 'sequence', schemaname || '.' || sequencename from pg_sequences where schemaname = 'public'
    union all
    select 'function', p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace
) o
where r.rolname in ('anon', 'authenticated')
order by role, kind, obj;

-- B. RLS er på for alle tabeller i public. Forventet: rls = true på alle rader.
select relname as table_name, relrowsecurity as rls
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

-- C. Som authenticated: dashboard-viewene kan leses. Forventet: seks tall.
begin;
set local role authenticated;
select (select count(*) from dashboard.content_latest)   as content_latest,
       (select count(*) from dashboard.concept_summary)  as concept_summary,
       (select count(*) from dashboard.platform_summary) as platform_summary,
       (select count(*) from dashboard.daily_activity)   as daily_activity,
       (select count(*) from dashboard.followers)        as followers,
       (select count(*) from dashboard.follower_points)  as follower_points;
rollback;

-- D. Som authenticated: rådata blokkeres. Forventet: ERROR permission denied for table posts.
begin;
set local role authenticated;
select count(*) from public.posts;
rollback;

-- D3. Som authenticated: kontrollpunktene blokkeres. Forventet: ERROR permission denied for table
--     follower_checkpoints.
begin;
set local role authenticated;
select count(*) from public.follower_checkpoints;
rollback;

-- D2. Som authenticated: den nye rådatatabellen blokkeres også.
--     Forventet: ERROR permission denied for table account_daily.
begin;
set local role authenticated;
select count(*) from public.account_daily;
rollback;

-- E. Som anon: dashboard blokkeres. Forventet: ERROR permission denied for schema dashboard.
--    (Gjelder også dashboard.followers; samme schema.)
begin;
set local role anon;
select count(*) from dashboard.content_latest;
rollback;

-- G. security_invoker per view. Forventet etter 2026-09-30_latest_views_owner_rights.sql:
--    false for alle ni (public.posts_latest, public.youtube_videos_latest, public.tiktok_videos_latest
--    og de seks dashboard-viewene).
select n.nspname as schema, c.relname as view,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                 where option_name = 'security_invoker'), 'false (standard)') as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v' and n.nspname in ('public', 'dashboard')
order by schema, view;

-- F. Standardrettigheter for nye objekter. Forventet: ingen rader for schema public som gir
--    anon eller authenticated noe (i defaclacl: ingen «anon=» eller «authenticated=»).
--    Rader for supabase_admin kan finnes; de styres av Supabase og ble hoppet over.
--    Eierrollen(e) for tabellene i public vises i første spørring.
select distinct pg_get_userbyid(c.relowner) as owner_of_public_objects
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'S');

select pg_get_userbyid(d.defaclrole) as for_role,
       coalesce(n.nspname, '(alle schemaer)') as schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
                            when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' end as object_type,
       d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' or d.defaclnamespace = 0
order by for_role, schema, object_type;

-- T. TikTok (2026-10-13_tiktok.sql). Kjør hver del for seg.
-- T1. anon/authenticated har ingen tilgang til tiktok_*, og authenticated kan bare kjøre de to
--     funksjonene i tilkobling. Forventet: allowed = false på alle rader, unntatt
--     authenticated + tilkobling.claim_tiktok_state og tilkobling.store_tiktok_token (true).
select r.rolname as role, o.kind, o.obj,
       case o.kind
           when 'function' then has_function_privilege(r.rolname, o.obj, 'execute')
           when 'sequence' then has_sequence_privilege(r.rolname, o.obj, 'usage')
           when 'schema'   then has_schema_privilege(r.rolname, o.obj, 'usage')
           else has_table_privilege(r.rolname, o.obj, 'select')
                or has_table_privilege(r.rolname, o.obj, 'insert')
                or has_table_privilege(r.rolname, o.obj, 'update')
                or has_table_privilege(r.rolname, o.obj, 'delete')
       end as allowed
from pg_roles r
cross join (
    select 'table' as kind, schemaname || '.' || tablename as obj
    from pg_tables where schemaname = 'public' and tablename like 'tiktok%'
    union all
    select 'view', schemaname || '.' || viewname from pg_views where schemaname = 'public' and viewname like 'tiktok%'
    union all
    select 'sequence', schemaname || '.' || sequencename
    from pg_sequences where schemaname = 'public' and sequencename like 'tiktok%'
    union all
    select 'function', p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'tilkobling'::regnamespace
    union all
    select 'schema', 'tilkobling'
) o
where r.rolname in ('anon', 'authenticated')
order by role, kind, obj;

-- T2. Funksjonene i tilkobling: security definer, fast search_path, og hvem som kan kjøre dem.
--     Forventet: to rader, security_definer = true, config = {search_path=""},
--     acl uten anon og uten «=X/» (PUBLIC).
select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig as config,
       pg_get_userbyid(p.proowner) as owner, p.proacl as acl
from pg_proc p
where p.pronamespace = 'tilkobling'::regnamespace
order by 1;

-- T3. Som authenticated: tokens og innlegg blokkeres.
--     Forventet: ERROR permission denied for table tiktok_tokens.
begin;
set local role authenticated;
select count(*) from public.tiktok_tokens;
rollback;

-- T4. Som authenticated uten innlogget bruker: funksjonen avviser.
--     Forventet: ERROR Ikke innlogget.
begin;
set local role authenticated;
select tilkobling.claim_tiktok_state(repeat('x', 43));
rollback;

-- T5. Som anon: tilkobling blokkeres. Forventet: ERROR permission denied for schema tilkobling.
begin;
set local role anon;
select tilkobling.claim_tiktok_state(repeat('x', 43));
rollback;

-- T6. RLS er på for TikTok-tabellene. Forventet: rls = true på fire rader.
select relname as table_name, relrowsecurity as rls
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'tiktok%'
order by relname;

-- P. Analyse (2026-10-16_post_features.sql). Kjør hver del for seg.
-- P1. Rettigheter. Forventet: allowed = true bare for authenticated på dashboard.post_features;
--     false for anon på begge, og for authenticated på public.reel_links.
select r.rolname as role, o.obj, has_table_privilege(r.rolname, o.obj, 'select') as allowed
from pg_roles r
cross join (values ('dashboard.post_features'), ('public.reel_links')) as o(obj)
where r.rolname in ('anon', 'authenticated')
order by role, obj;

-- P2. Som authenticated: post_features kan leses. Forventet: ett tall (antall innlegg, f.eks. 296).
begin;
set local role authenticated;
select count(*) as post_features from dashboard.post_features;
rollback;

-- P3. Som authenticated: reel_links blokkeres. Forventet: ERROR permission denied for table reel_links.
begin;
set local role authenticated;
select count(*) from public.reel_links;
rollback;

-- P4. security_invoker på post_features og RLS på reel_links.
--     Forventet: security_invoker = false og rls = true.
select (select coalesce((select option_value from pg_options_to_table(c.reloptions)
                         where option_name = 'security_invoker'), 'false (standard)')
        from pg_class c where c.oid = 'dashboard.post_features'::regclass) as security_invoker,
       (select relrowsecurity from pg_class where oid = 'public.reel_links'::regclass) as rls;
