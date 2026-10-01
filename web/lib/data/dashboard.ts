import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ConceptSummaryRow,
  ContentLatestRow,
  DailyActivityRow,
  DashboardView,
  PlatformSummaryRow,
  Result,
} from "./types";

// PostgREST gir maks 1000 rader per svar. Vi henter i sider, så ingenting kuttes stille bort
// når viewene vokser (platform_summary har allerede over 600 rader).
const PAGE_SIZE = 1000;
const FRIENDLY_ERROR = "Klarte ikke å hente tallene akkurat nå. Prøv igjen om litt.";

type PostgrestError = { code?: string; message?: string; details?: string; hint?: string } | null;

function fail<T>(where: string, error: PostgrestError, status?: number): Result<T> {
  // Hele feilen logges på serveren (Vercel → Logs); brukeren får en rolig melding.
  console.error(`Lesing av ${where} feilet:`, JSON.stringify({ status, error }));
  return { ok: false, error: FRIENDLY_ERROR };
}

/** order: én eller flere kolonner, kommaseparert. Må gi en entydig rekkefølge, ellers blir sidedelingen ustabil. */
async function selectAll<T>(view: DashboardView, columns: string, order: string): Promise<Result<T[]>> {
  try {
    const supabase = await createClient();
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase.from(view).select(columns);
      for (const column of order.split(",")) query = query.order(column.trim());
      const { data, error, status } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) return fail(view, error, status);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE_SIZE) return { ok: true, data: rows };
    }
  } catch (error) {
    unstable_rethrow(error); // Next sine interne signaler (f.eks. fra cookies()) skal ikke fanges
    return fail(view, { message: error instanceof Error ? error.message : String(error) });
  }
}

export function getContentLatest(): Promise<Result<ContentLatestRow[]>> {
  return selectAll<ContentLatestRow>("content_latest", "*", "platform,content_id");
}

export function getConceptSummary(): Promise<Result<ConceptSummaryRow[]>> {
  return selectAll<ConceptSummaryRow>("concept_summary", "*", "platform,account_id,format,concept,special_event");
}

export function getPlatformSummary(): Promise<Result<PlatformSummaryRow[]>> {
  return selectAll<PlatformSummaryRow>("platform_summary", "*", "account_id,format,period_type,period_start");
}

export function getDailyActivity(): Promise<Result<DailyActivityRow[]>> {
  return selectAll<DailyActivityRow>("daily_activity", "*", "account_id,activity_date,format");
}
