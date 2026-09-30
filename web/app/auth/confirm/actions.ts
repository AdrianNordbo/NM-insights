"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "invite"];

/**
 * Bruker engangskoden først når brukeren trykker «Logg inn» (POST).
 * GET på /auth/confirm gjør ingenting, så e-postskannere som åpner lenken ikke bruker opp koden.
 */
export async function confirmLogin(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !ALLOWED_TYPES.includes(type)) redirect("/logg-inn?feil=lenke");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect("/logg-inn?feil=lenke");
  redirect("/");
}
