"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Sender innloggingslenke. Ingen nye brukere opprettes (shouldCreateUser: false).
 * Svaret er det samme om adressen har tilgang eller ikke, så siden ikke avslører hvem som er bruker.
 *
 * Så lenge Supabase sin standardmal brukes, går lenken til /auth/callback (PKCE, samme nettleser).
 * Når egen SMTP og token_hash-malene er på plass, skal emailRedirectTo være siteUrl() alene,
 * fordi malen legger til /auth/confirm selv (se CLAUDE.md).
 */
export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/logg-inn?feil=epost");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  // For mange forespørsler er det eneste vi sier fra om; det avslører ikke hvem som har tilgang.
  if (error?.status === 429) redirect("/logg-inn?feil=grense");
  if (error) console.error("Innloggingslenke ikke sendt:", error.status, error.code);
  redirect("/logg-inn?sendt=1");
}
