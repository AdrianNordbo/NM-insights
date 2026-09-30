// Offentlige miljøvariabler. NEXT_PUBLIC_-verdier bygges inn i koden ved build,
// så de må refereres med fullt navn her. Supabase-nøkkelen med full tilgang brukes aldri i web/.

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Mangler NEXT_PUBLIC_SUPABASE_URL eller NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, key };
}

/** Adressen innloggingslenken skal føre tilbake til (uten avsluttende skråstrek). */
export function siteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Mangler NEXT_PUBLIC_SITE_URL.");
  return url.replace(/\/+$/, "");
}
