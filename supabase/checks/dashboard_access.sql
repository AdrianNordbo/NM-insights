-- NM Insights - kontroll av tilgang etter 2026-09-30_dashboard.sql
-- Kjør hver blokk for seg i Supabase SQL Editor. Ingen blokk endrer data.

-- A. Hvem kan bruke hva (anon/authenticated). Forventet: allowed = true BARE for authenticated
--    på de tre dashboard-viewene (select); false for alle tabeller, views, sekvenser og
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

-- C. Som authenticated: dashboard-viewene kan leses. Forventet: tre tall.
begin;
set local role authenticated;
select (select count(*) from dashboard.content_latest)   as content_latest,
       (select count(*) from dashboard.concept_summary)  as concept_summary,
       (select count(*) from dashboard.platform_summary) as platform_summary;
rollback;

-- D. Som authenticated: rådata blokkeres. Forventet: ERROR permission denied for table posts.
begin;
set local role authenticated;
select count(*) from public.posts;
rollback;

-- E. Som anon: dashboard blokkeres. Forventet: ERROR permission denied for schema dashboard.
begin;
set local role anon;
select count(*) from dashboard.content_latest;
rollback;

-- G. security_invoker per view. Forventet etter 2026-09-30_latest_views_owner_rights.sql:
--    false for alle fem (public.posts_latest, public.youtube_videos_latest og de tre dashboard-viewene).
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
