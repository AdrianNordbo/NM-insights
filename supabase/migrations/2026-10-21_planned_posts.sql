-- NM Insights - migrering 21.10.2026: delt publiseringskalender
--
-- public.plan_editors          hvem som kan skrive i kalenderen (user_id fra auth.users). Fylles separat med
--                              supabase/seed/plan_editors.sql (e-postadressen står ikke i repoet).
-- public.planned_posts         én rad per video per plattform: uke, tittel, type innhold, plattform, planlagt dag
--                              og klokkeslett (null = ikke plassert i uken), merking, grunnlag, status.
-- dashboard.planned_posts      lesing for alle innloggede (eierens rettigheter, som de andre dashboard-viewene).
-- planlegging.*                skriving bare via funksjoner (SECURITY DEFINER, fast search_path) som krever at
--                              innlogget bruker står i plan_editors.
--
-- Bare nye objekter: ingen DROP, DELETE eller UPDATE på eksisterende tabeller. Kan kjøres flere ganger.
--
-- Tilgang:
--   Tabellene: bare service_role (RLS på, ingen policies).
--   dashboard.planned_posts: SELECT for authenticated og service_role.
--   planlegging: USAGE og EXECUTE for authenticated og service_role. anon har ingenting.
--   Etter kjøring: legg til «planlegging» under Exposed schemas (API settings), som for «tilkobling».
--
-- Kjøres i Supabase SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Redaktører
-- ---------------------------------------------------------------------------
create table if not exists public.plan_editors (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    note        text,
    added_at    timestamptz not null default now()
);

comment on table public.plan_editors is
    'Brukere som kan skrive i den delte publiseringskalenderen. Alle andre innloggede ser den skrivebeskyttet.';

-- ---------------------------------------------------------------------------
-- 2. Planlagte innlegg
-- ---------------------------------------------------------------------------
create table if not exists public.planned_posts (
    id                  uuid primary key default gen_random_uuid(),
    video_id            uuid not null,                          -- samme video på flere plattformer
    aar                 integer not null,                       -- ISO-uke-år
    uke                 integer not null check (uke between 1 and 53),
    tittel              text not null check (length(tittel) between 1 and 200),
    konsept             text not null check (length(konsept) between 1 and 80),
    plattform           text not null check (plattform in ('instagram', 'youtube', 'tiktok', 'facebook')),
    planlagt_dato       date,                                   -- null = ikke plassert i uken
    klokkeslett         time,                                   -- Oslo-tid
    merking             text check (merking in ('Basert på data', 'Test')),
    grunnlag            text not null default '' check (length(grunnlag) <= 1000),
    status              text not null default 'Utkast' check (status in ('Utkast', 'Klar', 'Publisert')),
    flyttet_manuelt     boolean not null default false,
    opprettet_av        uuid references auth.users (id) on delete set null,
    opprettet           timestamptz not null default now(),
    oppdatert           timestamptz not null default now(),
    -- Dag og klokkeslett hører sammen, og en plassering ligger alltid i sin egen ISO-uke
    constraint planned_posts_dag_og_tid check ((planlagt_dato is null) = (klokkeslett is null)),
    constraint planned_posts_i_uken check (
        planlagt_dato is null
        or (extract(isoyear from planlagt_dato)::integer = aar and extract(week from planlagt_dato)::integer = uke)
    ),
    constraint planned_posts_unik unique (video_id, plattform)
);

create index if not exists planned_posts_uke_idx on public.planned_posts (aar, uke);

comment on table public.planned_posts is
    'Delt publiseringskalender: én rad per video per plattform i en ISO-uke. Utkast, aldri automatisk publisering.';

alter table public.plan_editors enable row level security;
alter table public.planned_posts enable row level security;
revoke all on public.plan_editors, public.planned_posts from public, anon, authenticated;
grant select, insert, update, delete on public.plan_editors, public.planned_posts to service_role;

-- ---------------------------------------------------------------------------
-- 3. Lesing: dashboard.planned_posts (alle innloggede)
-- ---------------------------------------------------------------------------
create or replace view dashboard.planned_posts
with (security_invoker = false) as
select
    p.id,
    p.video_id,
    p.aar,
    p.uke,
    p.tittel,
    p.konsept,
    p.plattform,
    p.planlagt_dato,
    to_char(p.klokkeslett, 'HH24:MI') as klokkeslett,
    p.merking,
    p.grunnlag,
    p.status,
    p.flyttet_manuelt,
    p.opprettet,
    p.oppdatert
from public.planned_posts p;

comment on view dashboard.planned_posts is
    'Den delte publiseringskalenderen, skrivebeskyttet. Skriving bare via funksjonene i schema planlegging.';

revoke all on dashboard.planned_posts from public, anon;
grant select on dashboard.planned_posts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Skriving: schema planlegging
-- ---------------------------------------------------------------------------
create schema if not exists planlegging;
revoke all on schema planlegging from public, anon, authenticated;
grant usage on schema planlegging to authenticated, service_role;

-- Er innlogget bruker redaktør? (Brukes av siden til å vise skjema og knapper.)
create or replace function planlegging.er_redaktor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null
       and exists (select 1 from public.plan_editors e where e.user_id = auth.uid());
$$;

-- Legger inn én video: én rad per plattform (p_rader er en JSON-liste med høyst 10 rader).
create or replace function planlegging.legg_til(p_rader jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rad   jsonb;
    v_antall integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if not exists (select 1 from public.plan_editors e where e.user_id = auth.uid()) then
        raise exception 'Bare redaktører kan endre kalenderen';
    end if;
    if jsonb_typeof(p_rader) <> 'array' or jsonb_array_length(p_rader) not between 1 and 10 then
        raise exception 'Ugyldig liste med rader';
    end if;

    for v_rad in select * from jsonb_array_elements(p_rader) loop
        insert into public.planned_posts (
            video_id, aar, uke, tittel, konsept, plattform, planlagt_dato, klokkeslett, merking, grunnlag, opprettet_av
        ) values (
            (v_rad ->> 'video_id')::uuid,
            (v_rad ->> 'aar')::integer,
            (v_rad ->> 'uke')::integer,
            v_rad ->> 'tittel',
            v_rad ->> 'konsept',
            v_rad ->> 'plattform',
            nullif(v_rad ->> 'planlagt_dato', '')::date,
            nullif(v_rad ->> 'klokkeslett', '')::time,
            nullif(v_rad ->> 'merking', ''),
            coalesce(v_rad ->> 'grunnlag', ''),
            auth.uid()
        );
        v_antall := v_antall + 1;
    end loop;
    return v_antall;
end $$;

-- Flytter en plassering til en annen dag eller et annet klokkeslett i samme uke (sjekket av tabellen).
create or replace function planlegging.flytt(p_id uuid, p_dato date, p_klokkeslett time)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if not exists (select 1 from public.plan_editors e where e.user_id = auth.uid()) then
        raise exception 'Bare redaktører kan endre kalenderen';
    end if;
    if p_dato is null or p_klokkeslett is null then
        raise exception 'Mangler dag eller klokkeslett';
    end if;
    update public.planned_posts
    set planlagt_dato = p_dato, klokkeslett = p_klokkeslett, flyttet_manuelt = true, oppdatert = now()
    where id = p_id;
    if not found then
        raise exception 'Fant ikke plasseringen';
    end if;
end $$;

-- Setter status (Utkast, Klar, Publisert).
create or replace function planlegging.sett_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if not exists (select 1 from public.plan_editors e where e.user_id = auth.uid()) then
        raise exception 'Bare redaktører kan endre kalenderen';
    end if;
    update public.planned_posts set status = p_status, oppdatert = now() where id = p_id;
    if not found then
        raise exception 'Fant ikke plasseringen';
    end if;
end $$;

-- Fjerner en video (alle plattformene) fra kalenderen. Gjelder bare rader i planned_posts.
create or replace function planlegging.fjern_video(p_video_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_antall integer;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if not exists (select 1 from public.plan_editors e where e.user_id = auth.uid()) then
        raise exception 'Bare redaktører kan endre kalenderen';
    end if;
    delete from public.planned_posts where video_id = p_video_id;
    get diagnostics v_antall = row_count;
    return v_antall;
end $$;

comment on function planlegging.er_redaktor() is 'Om innlogget bruker kan skrive i den delte kalenderen.';
comment on function planlegging.legg_til(jsonb) is 'Legger inn én video (én rad per plattform). Bare redaktører.';
comment on function planlegging.flytt(uuid, date, time) is 'Flytter en plassering innenfor samme uke og merker den flyttet manuelt. Bare redaktører.';
comment on function planlegging.sett_status(uuid, text) is 'Setter status Utkast/Klar/Publisert. Bare redaktører.';
comment on function planlegging.fjern_video(uuid) is 'Fjerner en video (alle plattformer) fra kalenderen. Bare redaktører.';

revoke all on function planlegging.er_redaktor() from public, anon, authenticated;
revoke all on function planlegging.legg_til(jsonb) from public, anon, authenticated;
revoke all on function planlegging.flytt(uuid, date, time) from public, anon, authenticated;
revoke all on function planlegging.sett_status(uuid, text) from public, anon, authenticated;
revoke all on function planlegging.fjern_video(uuid) from public, anon, authenticated;
grant execute on function planlegging.er_redaktor() to authenticated, service_role;
grant execute on function planlegging.legg_til(jsonb) to authenticated, service_role;
grant execute on function planlegging.flytt(uuid, date, time) to authenticated, service_role;
grant execute on function planlegging.sett_status(uuid, text) to authenticated, service_role;
grant execute on function planlegging.fjern_video(uuid) to authenticated, service_role;

commit;
