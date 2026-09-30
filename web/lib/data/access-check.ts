import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// MIDLERTIDIG (steg 4): viser at innlogget bruker ikke kan lese rådata i public.
// Fjernes i neste steg.
//
// Bruker GET (ikke head: true): et HEAD-svar har ingen body, så PostgREST sin feil (code, message,
// hint) forsvinner og bare HTTP-statusen er igjen. Det var derfor sjekken viste «ukjent:».

export type RawAccessCheck =
  | { verdict: "blocked"; status: number; code: string | null; message: string | null }
  | { verdict: "no_rows"; status: number }
  | { verdict: "data_returned"; status: number; rows: number }
  | { verdict: "inconclusive"; status: number | null; detail: string };

export async function checkRawAccessBlocked(): Promise<RawAccessCheck> {
  try {
    const supabase = await createClient();
    const { data, error, status, statusText } = await supabase.schema("public").from("posts").select("id").limit(1);

    // Hele svaret logges på serveren (Vercel → Logs), uten data.
    console.error("Rettighetssjekk public.posts:", JSON.stringify({ status, statusText, error, rows: data?.length ?? null }));

    // Data tilbake er det eneste som betyr at rådata er åpne.
    if (Array.isArray(data) && data.length > 0) return { verdict: "data_returned", status, rows: data.length };

    // Avvisning fra PostgREST eller databasen: 4xx med feil (f.eks. 401, 403 eller 42501).
    if (error && status >= 400 && status < 500) {
      return { verdict: "blocked", status, code: error.code || null, message: error.message || null };
    }

    // Ingen feil og ingen rader: forespørselen ble ikke avvist, så rollen har trolig SELECT og bare RLS
    // stopper radene. Det avviker fra oppsettet (ingen grants på rådata) og vises som gul advarsel.
    if (!error) return { verdict: "no_rows", status };

    // 5xx eller annet: vi vet ikke om tilgangen er stengt.
    return { verdict: "inconclusive", status, detail: `${error.code || "uten kode"}: ${error.message || statusText}` };
  } catch (error) {
    unstable_rethrow(error); // Next sine interne signaler (f.eks. fra cookies()) skal ikke fanges
    console.error("Rettighetssjekk public.posts kastet unntak:", error);
    return { verdict: "inconclusive", status: null, detail: error instanceof Error ? error.message : String(error) };
  }
}
