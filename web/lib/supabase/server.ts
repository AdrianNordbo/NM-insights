import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase-klient for server components, server actions og route handlers.
 * Leser schema dashboard med brukerens sesjon, altså som rollen authenticated.
 * Lag en ny klient per forespørsel; del aldri klienten mellom forespørsler.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    db: { schema: "dashboard" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components kan ikke sette cookies. proxy.ts fornyer sesjonen i stedet.
        }
      },
    },
  });
}
