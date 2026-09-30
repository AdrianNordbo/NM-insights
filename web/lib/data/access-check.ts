import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// MIDLERTIDIG (steg 4): viser at innlogget bruker ikke kan lese rådata i public.
// Fjernes i neste steg.

export type RawAccessCheck =
  | { blocked: true; code: string }
  | { blocked: false; rows: number }
  | { blocked: null; error: string };

export async function checkRawAccessBlocked(): Promise<RawAccessCheck> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .schema("public")
      .from("posts")
      .select("id", { count: "exact", head: true });
    if (error) {
      // 42501 = permission denied (forventet). Andre feil betyr at sjekken ikke kunne fullføres.
      if (error.code === "42501") return { blocked: true, code: error.code };
      return { blocked: null, error: `${error.code ?? "ukjent"}: ${error.message}` };
    }
    return { blocked: false, rows: count ?? 0 };
  } catch (error) {
    unstable_rethrow(error); // Next sine interne signaler (f.eks. fra cookies()) skal ikke fanges
    return { blocked: null, error: error instanceof Error ? error.message : String(error) };
  }
}
