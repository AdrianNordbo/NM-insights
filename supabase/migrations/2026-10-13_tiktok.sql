-- NM Insights - migrering 13.10.2026: TikTok, steg A (tilkobling) og B (tabeller for hentingen)
--
-- public.accounts                 ny rad: Veksthuset på TikTok (takeover_date og concepts_start 2026-06-15).
--                                 platform_account_id er 'pending:veksthuset' til kontoen er koblet;
--                                 da settes den til TikToks open_id.
-- public.tiktok_oauth_states      engangs-state for autoriseringslenken (bare SHA-256-hash lagres)
-- public.tiktok_tokens            kryptert refresh-token per konto (sealed box; web har bare den
--                                 offentlige nøkkelen, den private ligger i GitHub Secrets og lokal .env).
--                                 Access-tokenet lagres aldri.
-- public.tiktok_videos            én rad per innlegg (VIDEO eller PHOTO)
-- public.tiktok_video_insights    øyeblikksbilder per innlegg per dag og slot (levetidstall fra TikTok)
-- public.tiktok_videos_latest     nyeste måling per innlegg (eierens rettigheter, som de andre latest-viewene)
-- tilkobling.*                    to funksjoner callbacken på insights.nordbomarketing.no kaller som
--                                 innlogget bruker: løs inn state (én gang) og lagre det krypterte tokenet.
--                                 Ingen kan lese tokens gjennom dem.
--
-- Endrer ingenting som finnes fra før (bare nye tabeller, view, schema, funksjoner og én ny kontorad).
-- Dashboard-viewene endres først i steg C.
--
-- Tilgang:
--   Tabellene og viewet: bare service_role (RLS på, ingen policies).
--   tilkobling: authenticated har USAGE og EXECUTE på de to funksjonene. anon har ingenting.
--   Etter kjøring: legg til «tilkobling» under Exposed schemas (API settings) så callbacken når funksjonene.
--
-- Kjøres i Supabase SQL Editor. Kan kjøres flere ganger.

begin;

-- ---------------------------------------------------------------------------
-- 1. Kontoen
-- ---------------------------------------------------------------------------
insert into public.accounts (client_name, platform, platform_account_id, concepts_start, takeover_date)
select 'Veksthuset', 'tiktok', 'pending:veksthuset', date '2026-06-15', date '2026-06-15'
where not exists (
    select 1 from public.accounts where client_name = 'Veksthuset' and platform = 'tiktok'
);

-- ---------------------------------------------------------------------------
-- 2. Engangs-state for autoriseringslenken
-- Lages av tiktok_link.py (service_role). Bare hashen lagres, så en lekket tabell gir ingen gyldig lenke.
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_oauth_states (
    state_hash      text primary key,                       -- hex(SHA-256(state))
    account_id      bigint not null references public.accounts (id) on delete cascade,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null default now() + interval '30 minutes',
    used_at         timestamptz,                            -- løst inn av callbacken (bare én gang)
    used_by         uuid,                                   -- auth.users.id for den innloggede brukeren
    stored_at       timestamptz                             -- tokenet er lagret (bare én gang)
);

comment on table public.tiktok_oauth_states is
    'Engangs-state for TikToks autoriseringslenke. 30 minutters levetid. Bare hashen lagres.';

-- ---------------------------------------------------------------------------
-- 3. Tokens (kryptert)
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_tokens (
    account_id          bigint primary key references public.accounts (id) on delete cascade,
    open_id             text not null,                      -- TikToks app-spesifikke ID for kontoen
    scope               text[] not null default '{}',       -- scopes kontoeieren ga
    refresh_token_enc   text not null,                      -- base64(sealed box), aldri klartekst
    refresh_expires_at  timestamptz,                        -- 1 år fra autorisering; ny kobling etter det
    status              text not null default 'ok'
                        check (status in ('ok', 'needs_reauth', 'revoked')),
    authorized_at       timestamptz not null default now(),
    authorized_by       uuid,                               -- auth.users.id
    last_refresh_at     timestamptz,                        -- siste vellykkede fornyelse (fetch_tiktok.py)
    last_error          text,                               -- siste feilmelding, uten tokens
    updated_at          timestamptz not null default now()
);

comment on table public.tiktok_tokens is
    'Kryptert TikTok-refresh-token per konto. Bare service_role. Access-tokenet lagres aldri.';

-- ---------------------------------------------------------------------------
-- 4. Innlegg
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_videos (
    id                  bigint generated always as identity primary key,
    account_id          bigint not null references public.accounts (id) on delete restrict,
    platform_video_id   text not null,                      -- TikToks item_id
    published_at        timestamptz not null,               -- create_time
    caption             text,
    media_type          text check (media_type in ('VIDEO', 'PHOTO')),
    duration_s          numeric,                            -- video_duration (sekunder)
    is_ad               boolean,                            -- brukt i annonse: visningene kan inneholde betalt visning
    hashtags            text[] not null default '{}',       -- fra caption, uten #, små bokstaver
    permalink           text,                               -- share_url uten utm-parametere

    concept             text,
    concept_source      text check (concept_source in ('auto', 'manuell')),
    concept_reason      text,
    special_event       text,

    first_seen_at       timestamptz not null default now(),
    last_seen_at        timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (account_id, platform_video_id)
);

create index if not exists tiktok_videos_account_published_idx
    on public.tiktok_videos (account_id, published_at desc);

comment on table public.tiktok_videos is
    'Én rad per TikTok-innlegg (VIDEO eller PHOTO). Avledede felt (tittel = første linje, ukedag) lagres ikke.';

-- ---------------------------------------------------------------------------
-- 5. Øyeblikksbilder per innlegg (to per dag)
-- TikTok gir levetidstall med 24-48 timers forsinkelse. Dype mål (video.insights) kan mangle for
-- innlegg uten aktivitet de siste 7 dagene; da er de null i den målingen.
-- ---------------------------------------------------------------------------
create table if not exists public.tiktok_video_insights (
    video_id                    bigint not null references public.tiktok_videos (id) on delete cascade,
    snapshot_date               date not null,              -- dato i kontoens tidssone
    snapshot_slot               text not null default 'morgen'
                                check (snapshot_slot in ('morgen', 'kveld')),
    fetched_at                  timestamptz not null default now(),

    -- video.list
    views                       bigint,                     -- video_views (organisk + betalt)
    likes                       integer,
    comments                    integer,
    shares                      integer,                    -- inkl. «Send til venner»
    favorites                   integer,
    reach                       integer,

    -- video.insights
    total_time_watched_s        numeric,
    average_time_watched_s      numeric,
    full_video_watched_rate     numeric,                    -- andel 0-1
    new_followers               integer,
    profile_views               integer,                    -- bare Business-kontoer, ellers null

    raw                         jsonb,                      -- API-svaret for innlegget, aldri tokens
    primary key (video_id, snapshot_date, snapshot_slot)
);

create index if not exists tiktok_video_insights_date_idx
    on public.tiktok_video_insights (snapshot_date);

comment on table public.tiktok_video_insights is
    'Én rad per TikTok-innlegg per dag og slot. Levetidstall, 24-48 t forsinkelse. Samme dag + slot oppdaterer raden.';

-- ---------------------------------------------------------------------------
-- 6. Siste tall per innlegg
-- Tellinger fra nyeste måling; dype mål fra nyeste måling der reach fantes (de forsvinner fra API-et
-- når innlegget har vært uten aktivitet i 7 dager).
-- ---------------------------------------------------------------------------
create or replace view public.tiktok_videos_latest
with (security_invoker = false) as
select distinct on (v.id)
    v.*,
    i.snapshot_date,
    i.snapshot_slot,
    i.fetched_at,
    i.views, i.likes, i.comments, i.shares, i.favorites,
    d.reach, d.total_time_watched_s, d.average_time_watched_s, d.full_video_watched_rate,
    d.new_followers, d.profile_views,
    d.snapshot_date as deep_snapshot_date
from public.tiktok_videos v
left join public.tiktok_video_insights i on i.video_id = v.id
left join lateral (
    select x.reach, x.total_time_watched_s, x.average_time_watched_s, x.full_video_watched_rate,
           x.new_followers, x.profile_views, x.snapshot_date
    from public.tiktok_video_insights x
    where x.video_id = v.id and x.reach is not null
    order by x.snapshot_date desc, x.fetched_at desc
    limit 1
) d on true
order by v.id, i.snapshot_date desc, i.fetched_at desc;

-- ---------------------------------------------------------------------------
-- 7. Rettigheter for tabellene og viewet: bare service_role
-- ---------------------------------------------------------------------------
alter table public.tiktok_oauth_states    enable row level security;
alter table public.tiktok_tokens         enable row level security;
alter table public.tiktok_videos         enable row level security;
alter table public.tiktok_video_insights enable row level security;

revoke all on public.tiktok_oauth_states, public.tiktok_tokens, public.tiktok_videos,
    public.tiktok_video_insights, public.tiktok_videos_latest
    from public, anon, authenticated;
grant select, insert, update, delete
    on public.tiktok_oauth_states, public.tiktok_tokens, public.tiktok_videos, public.tiktok_video_insights
    to service_role;
grant select on public.tiktok_videos_latest to service_role;
grant usage, select on sequence public.tiktok_videos_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 8. Schema tilkobling: det callbacken kaller som innlogget bruker
-- Funksjonene kjører med eierens rettigheter (security definer), men slipper bare gjennom:
--   - en innlogget bruker (auth.uid() er satt)
--   - en gyldig, ubrukt state som ikke er utløpt
--   - lagring bare av den samme brukeren som løste inn staten, innen 15 minutter, én gang
--   - et token som ikke ser ut som klartekst (TikToks refresh-tokens starter med «rft.»)
--   - samme TikTok-konto som før (en konto som allerede er koblet, kan ikke byttes til en annen open_id)
-- Ingen funksjon returnerer tokens.
-- ---------------------------------------------------------------------------
create schema if not exists tilkobling;

revoke all on schema tilkobling from public, anon, authenticated;
grant usage on schema tilkobling to authenticated, service_role;

create or replace function tilkobling.claim_tiktok_state(p_state text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if p_state is null or length(p_state) not between 32 and 128 then
        raise exception 'Ugyldig state';
    end if;

    update public.tiktok_oauth_states
    set used_at = now(), used_by = auth.uid()
    where state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
      and used_at is null
      and expires_at > now()
    returning account_id into v_account_id;

    if v_account_id is null then
        raise exception 'Lenken er ugyldig, utløpt eller allerede brukt. Lag en ny med tiktok_link.py.';
    end if;
    return v_account_id;
end $$;

create or replace function tilkobling.store_tiktok_token(
    p_state                     text,
    p_open_id                   text,
    p_scope                     text[],
    p_refresh_token_enc         text,
    p_refresh_expires_in        integer,
    p_username                  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account_id    bigint;
    v_current_id    text;
begin
    if auth.uid() is null then
        raise exception 'Ikke innlogget';
    end if;
    if p_open_id is null or length(p_open_id) = 0 then
        raise exception 'Mangler open_id';
    end if;
    if p_refresh_token_enc is null or length(p_refresh_token_enc) < 64 or p_refresh_token_enc like 'rft.%' then
        raise exception 'Tokenet er ikke kryptert';
    end if;

    update public.tiktok_oauth_states
    set stored_at = now()
    where state_hash = encode(sha256(convert_to(p_state, 'UTF8')), 'hex')
      and used_by = auth.uid()
      and used_at > now() - interval '15 minutes'
      and stored_at is null
    returning account_id into v_account_id;

    if v_account_id is null then
        raise exception 'Ingen gyldig innløst lenke for denne brukeren';
    end if;

    select platform_account_id into v_current_id
    from public.accounts
    where id = v_account_id and platform = 'tiktok'
    for update;

    if v_current_id is null then
        raise exception 'Kontoen finnes ikke eller er ikke en TikTok-konto';
    end if;
    if v_current_id not like 'pending:%' and v_current_id <> p_open_id then
        raise exception 'Kontoen er allerede koblet til en annen TikTok-konto';
    end if;

    update public.accounts
    set platform_account_id = p_open_id,
        username = coalesce(nullif(p_username, ''), username)
    where id = v_account_id;

    insert into public.tiktok_tokens as t
        (account_id, open_id, scope, refresh_token_enc, refresh_expires_at, status,
         authorized_at, authorized_by, last_error, updated_at)
    values
        (v_account_id, p_open_id, coalesce(p_scope, '{}'), p_refresh_token_enc,
         now() + make_interval(secs => coalesce(p_refresh_expires_in, 0)), 'ok',
         now(), auth.uid(), null, now())
    on conflict (account_id) do update set
        open_id            = excluded.open_id,
        scope              = excluded.scope,
        refresh_token_enc  = excluded.refresh_token_enc,
        refresh_expires_at = excluded.refresh_expires_at,
        status             = 'ok',
        authorized_at      = excluded.authorized_at,
        authorized_by      = excluded.authorized_by,
        last_error         = null,
        updated_at         = now();
end $$;

comment on function tilkobling.claim_tiktok_state(text) is
    'Løser inn en engangs-state fra tiktok_link.py. Returnerer account_id. Kalles av /tiktok/callback.';
comment on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text) is
    'Lagrer kryptert refresh-token for kontoen staten gjelder. Samme bruker, innen 15 min, én gang.';

revoke all on function tilkobling.claim_tiktok_state(text) from public, anon, authenticated;
revoke all on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text)
    from public, anon, authenticated;
grant execute on function tilkobling.claim_tiktok_state(text) to authenticated, service_role;
grant execute on function tilkobling.store_tiktok_token(text, text, text[], text, integer, text)
    to authenticated, service_role;

commit;
