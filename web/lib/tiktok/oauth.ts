// TikTok-kobling (Accounts API v1.3): les callback-adressen, bytt koden mot tokens, hent kontoinfo.
// Brukes bare på serveren (server action i app/(app)/tiktok/callback). Tokens logges aldri, og feilmeldinger
// inneholder bare TikToks kode og melding, aldri det som ble sendt.

export const TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/";
export const PROFILE_URL = "https://business-api.tiktok.com/open_api/v1.3/business/get/";

/** Scopene appen er godkjent med. Mangler noen, vises det etter koblingen. */
export const REQUIRED_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.stats",
  "user.info.profile",
  "user.account.type",
  "user.insights",
  "video.list",
  "video.insights",
];

const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const TIMEOUT_MS = 15_000;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export type CallbackParams = { ok: true; code: string; state: string } | { ok: false; reason: string };

/** Leser adressen TikTok sender brukeren tilbake til. Koden heter auth_code eller code. */
export function readCallbackParams(params: Params): CallbackParams {
  const error = first(params.error) || first(params.error_type);
  if (error) return { ok: false, reason: "Tilgangen ble ikke gitt i TikTok. Lag en ny lenke og prøv igjen." };
  const code = first(params.auth_code) || first(params.code);
  const state = first(params.state);
  if (!code || !STATE_PATTERN.test(state)) {
    return { ok: false, reason: "Lenken mangler informasjon. Lag en ny med tiktok_link.py." };
  }
  return { ok: true, code, state };
}

export const isValidState = (state: string) => STATE_PATTERN.test(state);

export function parseScopes(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/[\s,]+/).filter(Boolean);
}

export const missingScopes = (granted: string[]) => REQUIRED_SCOPES.filter((s) => !granted.includes(s));

export class TikTokError extends Error {}

export type TikTokEnv = { clientId: string; clientSecret: string; redirectUri: string; publicKey: string };

/** Servervariablene (ingen av dem er NEXT_PUBLIC_). Feilmeldingen nevner bare navnene som mangler. */
export function tiktokServerEnv(env: Record<string, string | undefined> = process.env): TikTokEnv {
  const values = {
    TIKTOK_CLIENT_ID: env.TIKTOK_CLIENT_ID,
    TIKTOK_CLIENT_SECRET: env.TIKTOK_CLIENT_SECRET,
    TIKTOK_REDIRECT_URI: env.TIKTOK_REDIRECT_URI,
    TIKTOK_TOKEN_PUBLIC_KEY: env.TIKTOK_TOKEN_PUBLIC_KEY,
  };
  const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new TikTokError(`TikTok-koblingen er ikke satt opp på serveren (mangler ${missing.join(", ")}).`);
  const redirectUri = values.TIKTOK_REDIRECT_URI!;
  if (!redirectUri.startsWith("https://") || !redirectUri.endsWith("/tiktok/callback/")) {
    throw new TikTokError("TIKTOK_REDIRECT_URI må være https og slutte på /tiktok/callback/.");
  }
  return {
    clientId: values.TIKTOK_CLIENT_ID!,
    clientSecret: values.TIKTOK_CLIENT_SECRET!,
    redirectUri,
    publicKey: values.TIKTOK_TOKEN_PUBLIC_KEY!,
  };
}

export type TokenResult = {
  openId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
  refreshExpiresIn: number;
};

type TikTokBody<T> = { code?: number; message?: string; data?: T };

async function readBody<T>(res: Response): Promise<TikTokBody<T>> {
  try {
    return (await res.json()) as TikTokBody<T>;
  } catch {
    return {};
  }
}

const describe = (res: Response, body: TikTokBody<unknown>) =>
  `TikTok svarte ${body.code ?? res.status}${body.message ? `: ${String(body.message).slice(0, 200)}` : ""}`;

/** Bytter engangskoden (gyldig i 10 minutter) mot tokens. */
export async function exchangeCode(env: TikTokEnv, code: string, fetchImpl: typeof fetch = fetch): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        grant_type: "authorization_code",
        auth_code: code,
        redirect_uri: env.redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new TikTokError("Fikk ikke kontakt med TikTok.");
  }
  type Data = {
    open_id?: string;
    scope?: string;
    access_token?: string;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
  const body = await readBody<Data>(res);
  const d = body.data;
  if (!res.ok || body.code !== 0 || !d?.open_id || !d.access_token || !d.refresh_token) {
    throw new TikTokError(describe(res, body));
  }
  return {
    openId: d.open_id,
    scopes: parseScopes(d.scope),
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    refreshExpiresIn: Number(d.refresh_token_expires_in) || 0,
  };
}

export type Profile = {
  username: string | null;
  displayName: string | null;
  isBusinessAccount: boolean | null;
  hasAdvancedAccess: boolean | null;
};

/** Brukernavn og kontotype. Feiler den, fortsetter koblingen uten (returnerer null). */
export async function fetchProfile(openId: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<Profile | null> {
  const url = new URL(PROFILE_URL);
  url.searchParams.set("business_id", openId);
  url.searchParams.set("fields", JSON.stringify(["username", "display_name", "is_business_account", "has_advanced_access"]));
  try {
    const res = await fetchImpl(url, {
      headers: { "Access-Token": accessToken },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    type Data = { username?: string; display_name?: string; is_business_account?: boolean; has_advanced_access?: boolean };
    const body = await readBody<Data>(res);
    if (!res.ok || body.code !== 0 || !body.data) return null;
    const d = body.data;
    return {
      username: d.username ?? null,
      displayName: d.display_name ?? null,
      isBusinessAccount: typeof d.is_business_account === "boolean" ? d.is_business_account : null,
      hasAdvancedAccess: typeof d.has_advanced_access === "boolean" ? d.has_advanced_access : null,
    };
  } catch {
    return null;
  }
}
