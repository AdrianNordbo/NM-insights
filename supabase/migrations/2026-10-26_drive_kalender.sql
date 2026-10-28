-- NM Insights - migrering 26.10.2026: videoer fra Google Drive inn i den delte publiseringskalenderen
--
-- public.drive_videos          innboks: én rad per videofil i Drive (fil-ID fra Drive er nøkkelen), tolket av
--                              fetch_drive.py (konsept, uke, gjest, yrke, caption-skjelett). Bare service_role skriver.
-- public.planned_posts         tre nye, valgfrie kolonner: drive_file_id, caption_skjelett, caption_tekst.
--                              Unik (drive_file_id, plattform), så en Drive-fil aldri legges inn to ganger.
-- dashboard.planned_posts      samme kolonner som før, i samme rekkefølge, med de tre nye bakerst.
-- dashboard.drive_innboks      innboksen, bare synlig for redaktører (plan_editors); andre innloggede får 0 rader.
-- planlegging.legg_til_fra_drive   som legg_til, men for én Drive-fil (kopierer skjelettet, aldri dubletter).
-- planlegging.lagre_caption        lagrer ferdig tekst; Klar med [SKRIV igjen settes tilbake til Utkast.
-- planlegging.sett_status          som før (samme signatur og validering), pluss sperre: ikke Klar med [SKRIV.
--
-- Bakoverkompatibel: bare nye objekter og nye kolonner (null for eksisterende rader). Ingen DROP, DELETE eller
-- UPDATE av data. Viewet og sett_status erstattes med create or replace; dagens app leser viewet med select *
-- og plukker bare kjente felt, og poster uten caption kan settes til Klar som før. Kan kjøres flere ganger.
--
-- Tilgang:
--   drive_videos: bare service_role (RLS på, ingen policies).
--   dashboard.drive_innboks: SELECT for authenticated (rader bare for redaktører) og service_role. anon ingenting.
--   Nye funksjoner: EXECUTE for authenticated og service_role. anon ingenting.
--
-- Kontroll etterpå: blokk DR i supabase/checks/dashboard_access.sql. Tilbakerulling: nederst i filen (kommentert ut).
-- Kjøres i Supabase SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Innboks fra Drive
-- ---------------------------------------------------------------------------
create table if not exists public.drive_videos (
    drive_file_id       text primary key,                       -- fil-ID i Drive (fast ved nytt navn og flytting)
    konsept             text not null check (konsept in ('Folka Først', 'Sitcom', 'På Gata')),
    aar                 integer not null,                       -- ISO-uke-år fra ukemappen
    uke                 integer not null check (uke between 1 and 53),
    mappe               text not null check (length(mappe) <= 300),
    filnavn             text not null check (length(filnavn) between 1 and 300),
    drive_lenke         text check (length(drive_lenke) <= 500),
    tittel              text check (length(tittel) between 1 and 200),
    gjest               text check (length(gjest) <= 100),
    yrke                text check (length(yrke) <= 100),
    videonr             integer,
    tema                text check (length(tema) <= 200),
    tolkning            text not null check (tolkning in ('ok', 'stopp', 'ikke tolket')),
    melding             text not null default '' check (length(melding) <= 1000),
    caption_skjelett    text check (length(caption_skjelett) <= 2200),
    finnes_i_drive      boolean not null default true,
    endret_i_drive      timestamptz,
    forst_sett          timestamptz not null default now(),
    sist_sett           timestamptz not null default now(),
    constraint drive_videos_ok_har_skjelett check (tolkning <> 'ok' or (tittel is not null and caption_skjelett is not null))
);

create index if not exists drive_videos_uke_idx on public.drive_videos (aar, uke);

comment on table public.drive_videos is
    'Videofiler fra Google Drive tolket av fetch_drive.py. Bare metadata (navn), aldri selve filen. Skrives bare av service_role.';

alter table public.drive_videos enable row level security;
revoke all on public.drive_videos from public, anon, authenticated;
grant select, insert, update, delete on public.drive_videos to service_role;

-- ---------------------------------------------------------------------------
-- 2. Nye kolonner i planned_posts (null for alle eksisterende rader)
-- ---------------------------------------------------------------------------
alter table public.planned_posts
    add column if not exists drive_file_id    text references public.drive_videos (drive_file_id) on delete set null,
    add column if not exists caption_skjelett text check (length(caption_skjelett) <= 2200),
    add column if not exists caption_tekst    text check (length(caption_tekst) <= 2200);

create unique index if not exists planned_posts_drive_unik
    on public.planned_posts (drive_file_id, plattform) where drive_file_id is not null;

comment on column public.planned_posts.caption_skjelett is
    'Skjelett fra Drive-innboksen, fryst da posten ble lagt inn. [SKRIV …] fylles ut manuelt.';
comment on column public.planned_posts.caption_tekst is
    'Ferdig caption skrevet av redaktøren. Kan ikke være Klar mens teksten (eller skjelettet) har [SKRIV.';

-- ---------------------------------------------------------------------------
-- 3. Lesing: dashboard.planned_posts (som 2026-10-21, nye kolonner bakerst)
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
    p.oppdatert,
    p.drive_file_id,
    p.caption_skjelett,
    p.caption_tekst
from public.planned_posts p;

comment on view dashboard.planned_posts is
    'Den delte publiseringskalenderen, skrivebeskyttet. Skriving bare via funksjonene i schema planlegging.';

revoke all on dashboard.planned_posts from public, anon;
grant select on dashboard.planned_posts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Lesing: dashboard.drive_innboks (bare redaktører)
-- ---------------------------------------------------------------------------
-- Viewet kjører med eierens rettigheter (som de andre dashboard-viewene), men gir bare rader når innlogget
-- bruker står i plan_editors. Andre innloggede (og SQL Editor, uten innlogget bruker) får 0 rader.
create or replace view dashboard.drive_innboks
with (security_invoker = false) as
select
    d.drive_file_id,
    d.konsept,
    d.aar,
    d.uke,
    d.mappe,
    d.filnavn,
    d.drive_lenke,
    d.tittel,
    d.gjest,
    d.yrke,
    d.videonr,
    d.tema,
    d.tolkning,
    d.melding,
    d.caption_skjelett,
    d.finnes_i_drive,
    d.sist_sett,
    exists (select 1 from public.planned_posts p where p.drive_file_id = d.drive_file_id) as i_kalenderen
from public.drive_videos d
where exists (select 1 from public.plan_editors e where e.user_id = auth.uid());

comment on view dashboard.drive_innboks is
    'Videoer fra Drive som kan legges i kalenderen. Rader bare for redaktører (plan_editors).';

revoke all on dashboard.drive_innboks from public, anon, authenticated;
grant select on dashboard.drive_innboks to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Skriving: planlegging
-- ---------------------------------------------------------------------------

-- Legger inn én Drive-video: én rad per plattform. Samme validering som legg_til (innlogget, redaktør,
-- 1–10 rader, og tabellens sjekker for plattform, uke, tittel, konsept, dag/klokkeslett i uken og unik
-- video per plattform), pluss: filen finnes i innboksen og er tolket ok, ligger ikke i kalenderen fra før,
-- alle radene gjelder samme video og uken fra Drive-mappen, og konseptet er Drive-konseptet (eventuelt med
-- bruddnavn, f.eks. «Folka Først (fra 18.10)»). Skjelettet kopieres fra innboksen.
create or replace function planlegging.legg_til_fra_drive(p_drive_file_id text, p_rader jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_rad    jsonb;
    v_antall integer := 0;
    v_d      public.drive_videos;
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

    select * into v_d from public.drive_videos d where d.drive_file_id = p_drive_file_id;
    if not found then
        raise exception 'Fant ikke videoen i Drive-innboksen';
    end if;
    if v_d.tolkning <> 'ok' then
        raise exception 'Videoen er ikke tolket ok (%): %', v_d.tolkning, v_d.melding;
    end if;
    if exists (select 1 from public.planned_posts p where p.drive_file_id = p_drive_file_id) then
        raise exception 'Videoen ligger allerede i kalenderen';
    end if;
    if (select count(distinct e ->> 'video_id') from jsonb_array_elements(p_rader) as r(e)) <> 1 then
        raise exception 'Alle radene må gjelde samme video';
    end if;

    for v_rad in select * from jsonb_array_elements(p_rader) loop
        if (v_rad ->> 'aar')::integer is distinct from v_d.aar or (v_rad ->> 'uke')::integer is distinct from v_d.uke then
            raise exception 'Uken må være uken fra Drive-mappen (% uke %)', v_d.aar, v_d.uke;
        end if;
        if split_part(v_rad ->> 'konsept', ' (fra ', 1) is distinct from v_d.konsept then
            raise exception 'Konseptet må være % (fra Drive-mappen)', v_d.konsept;
        end if;
        insert into public.planned_posts (
            video_id, aar, uke, tittel, konsept, plattform, planlagt_dato, klokkeslett, merking, grunnlag, opprettet_av,
            drive_file_id, caption_skjelett
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
            auth.uid(),
            p_drive_file_id,
            v_d.caption_skjelett
        );
        v_antall := v_antall + 1;
    end loop;
    return v_antall;
end $$;

-- Lagrer ferdig caption for én plassering. Tom tekst = null (skjelettet gjelder). En post som er Klar
-- settes tilbake til Utkast hvis teksten (eller skjelettet, når teksten er tom) fortsatt har [SKRIV.
create or replace function planlegging.lagre_caption(p_id uuid, p_tekst text)
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
    update public.planned_posts
    set caption_tekst = nullif(btrim(p_tekst), ''),
        status = case
            when status = 'Klar' and coalesce(nullif(btrim(p_tekst), ''), caption_skjelett, '') like '%[SKRIV%' then 'Utkast'
            else status
        end,
        oppdatert = now()
    where id = p_id;
    if not found then
        raise exception 'Fant ikke plasseringen';
    end if;
end $$;

-- Setter status (Utkast, Klar, Publisert). Som 2026-10-21, pluss: ikke Klar mens captionen har [SKRIV.
-- Poster uten caption (lagt inn manuelt) kan settes til Klar som før.
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
    if p_status = 'Klar' and exists (
        select 1 from public.planned_posts p
        where p.id = p_id and coalesce(p.caption_tekst, p.caption_skjelett, '') like '%[SKRIV%'
    ) then
        raise exception 'Captionen har fortsatt [SKRIV …] og kan ikke settes til Klar';
    end if;
    update public.planned_posts set status = p_status, oppdatert = now() where id = p_id;
    if not found then
        raise exception 'Fant ikke plasseringen';
    end if;
end $$;

comment on function planlegging.legg_til_fra_drive(text, jsonb) is 'Legger inn én Drive-video (én rad per plattform), aldri to ganger. Bare redaktører.';
comment on function planlegging.lagre_caption(uuid, text) is 'Lagrer ferdig caption; Klar med [SKRIV settes tilbake til Utkast. Bare redaktører.';
comment on function planlegging.sett_status(uuid, text) is 'Setter status Utkast/Klar/Publisert; ikke Klar med [SKRIV i captionen. Bare redaktører.';

-- create or replace beholder rettighetene på sett_status; settes likevel likt som før for sikkerhets skyld
revoke all on function planlegging.legg_til_fra_drive(text, jsonb) from public, anon, authenticated;
revoke all on function planlegging.lagre_caption(uuid, text) from public, anon, authenticated;
revoke all on function planlegging.sett_status(uuid, text) from public, anon, authenticated;
grant execute on function planlegging.legg_til_fra_drive(text, jsonb) to authenticated, service_role;
grant execute on function planlegging.lagre_caption(uuid, text) to authenticated, service_role;
grant execute on function planlegging.sett_status(uuid, text) to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Tilbakerulling (IKKE en del av migreringen; kjøres bare hvis noe går galt, og bare før appkoden som bruker
-- de nye objektene er ute). Fjerner alt over og setter viewet og sett_status tilbake til 2026-10-21.
-- Sletter Drive-innboksen og eventuelle captions skrevet i mellomtiden; manuelt innlagte poster beholdes.
-- ---------------------------------------------------------------------------
-- begin;
-- drop function if exists planlegging.legg_til_fra_drive(text, jsonb);
-- drop function if exists planlegging.lagre_caption(uuid, text);
-- create or replace function planlegging.sett_status(p_id uuid, p_status text)
-- returns void language plpgsql security definer set search_path = '' as $$
-- begin
--     if auth.uid() is null then
--         raise exception 'Ikke innlogget';
--     end if;
--     if not exists (select 1 from public.plan_editors e where e.user_id = auth.uid()) then
--         raise exception 'Bare redaktører kan endre kalenderen';
--     end if;
--     update public.planned_posts set status = p_status, oppdatert = now() where id = p_id;
--     if not found then
--         raise exception 'Fant ikke plasseringen';
--     end if;
-- end $$;
-- comment on function planlegging.sett_status(uuid, text) is 'Setter status Utkast/Klar/Publisert. Bare redaktører.';
-- drop view if exists dashboard.drive_innboks;
-- drop view if exists dashboard.planned_posts;             -- kolonner kan ikke fjernes med create or replace
-- create view dashboard.planned_posts with (security_invoker = false) as
-- select p.id, p.video_id, p.aar, p.uke, p.tittel, p.konsept, p.plattform, p.planlagt_dato,
--        to_char(p.klokkeslett, 'HH24:MI') as klokkeslett, p.merking, p.grunnlag, p.status,
--        p.flyttet_manuelt, p.opprettet, p.oppdatert
-- from public.planned_posts p;
-- comment on view dashboard.planned_posts is
--     'Den delte publiseringskalenderen, skrivebeskyttet. Skriving bare via funksjonene i schema planlegging.';
-- revoke all on dashboard.planned_posts from public, anon;
-- grant select on dashboard.planned_posts to authenticated, service_role;
-- drop index if exists public.planned_posts_drive_unik;
-- alter table public.planned_posts
--     drop column if exists drive_file_id,
--     drop column if exists caption_skjelett,
--     drop column if exists caption_tekst;
-- drop table if exists public.drive_videos;
-- commit;
