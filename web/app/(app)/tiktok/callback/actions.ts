"use server";

import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/tiktok/crypto";
import { exchangeCode, fetchProfile, isValidState, missingScopes, TikTokError, tiktokServerEnv } from "@/lib/tiktok/oauth";

export type KoblingResultat =
  | {
      ok: true;
      username: string | null;
      scopes: string[];
      missing: string[];
      isBusinessAccount: boolean | null;
      hasAdvancedAccess: boolean | null;
    }
  | { ok: false; message: string }
  | null;

const NY_LENKE = "Lag en ny lenke med tiktok_link.py og prøv igjen.";

/**
 * Fullfører koblingen når knappen trykkes (POST), som /auth/confirm:
 * løs inn state (én gang) → bytt koden mot tokens hos TikTok → krypter refresh-tokenet med den
 * offentlige nøkkelen → lagre via tilkobling.store_tiktok_token. Access-tokenet brukes bare til å hente
 * brukernavn og kontotype, og lagres ikke. Tokens returneres aldri til nettleseren.
 */
export async function fullforKobling(_prev: KoblingResultat, formData: FormData): Promise<KoblingResultat> {
  const user = await getUser();
  if (!user) return { ok: false, message: "Du må være innlogget i dashboardet." };

  const code = String(formData.get("code") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!code || !isValidState(state)) return { ok: false, message: `Lenken mangler informasjon. ${NY_LENKE}` };

  let env;
  try {
    env = tiktokServerEnv();
  } catch (e) {
    return { ok: false, message: e instanceof TikTokError ? e.message : "TikTok-koblingen er ikke satt opp." };
  }

  const db = (await createClient()).schema("tilkobling");
  const claim = await db.rpc("claim_tiktok_state", { p_state: state });
  if (claim.error) return { ok: false, message: claim.error.message };

  let token;
  try {
    token = await exchangeCode(env, code);
  } catch (e) {
    const reason = e instanceof TikTokError ? e.message : "Ukjent feil mot TikTok.";
    return { ok: false, message: `${reason.replace(/\.$/, "")}. ${NY_LENKE}` };
  }

  const profile = await fetchProfile(token.openId, token.accessToken);
  const store = await db.rpc("store_tiktok_token", {
    p_state: state,
    p_open_id: token.openId,
    p_scope: token.scopes,
    p_refresh_token_enc: encryptToken(env.publicKey, token.refreshToken),
    p_refresh_expires_in: token.refreshExpiresIn,
    p_username: profile?.username ?? null,
  });
  if (store.error) return { ok: false, message: `Kunne ikke lagre koblingen: ${store.error.message}. ${NY_LENKE}` };

  return {
    ok: true,
    username: profile?.username ?? null,
    scopes: token.scopes,
    missing: missingScopes(token.scopes),
    isBusinessAccount: profile?.isBusinessAccount ?? null,
    hasAdvancedAccess: profile?.hasAdvancedAccess ?? null,
  };
}
