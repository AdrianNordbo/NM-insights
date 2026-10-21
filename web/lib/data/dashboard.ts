import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FeatureRow } from "../analyse/analyse";
import { onlyKnown, onlyKnownPlatforms } from "./kjente";
import type {
  ConceptSummaryRow,
  ContentLatestRow,
  DailyActivityRow,
  DashboardView,
  FollowerPointRow,
  FollowerRow,
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

/** Beholder bare rader dashboardet kjenner (se kjente.ts). */
function keep<T>(result: Result<T[]>, filter: (rows: T[]) => T[]): Result<T[]> {
  return result.ok ? { ok: true, data: filter(result.data) } : result;
}

export async function getContentLatest(): Promise<Result<ContentLatestRow[]>> {
  return keep(await selectAll<ContentLatestRow>("content_latest", "*", "platform,content_id"), onlyKnown);
}

export async function getConceptSummary(): Promise<Result<ConceptSummaryRow[]>> {
  return keep(await selectAll<ConceptSummaryRow>("concept_summary", "*", "platform,account_id,format,concept,special_event"), onlyKnown);
}

export async function getPlatformSummary(): Promise<Result<PlatformSummaryRow[]>> {
  return keep(await selectAll<PlatformSummaryRow>("platform_summary", "*", "account_id,format,period_type,period_start"), onlyKnown);
}

/**
 * dashboard.followers (2026-10-15_followers.sql). Mangler viewet (før migreringen) eller feiler spørringen,
 * gir dette en feil som page.tsx behandler som «ingen følgerdata»: kortene vises da som før, uten melding.
 */
export async function getFollowers(): Promise<Result<FollowerRow[]>> {
  return keep(await selectAll<FollowerRow>("followers", "*", "account_id,day"), onlyKnownPlatforms);
}

/**
 * dashboard.follower_points (2026-10-15_follower_checkpoints.sql). Valgfritt som followers: mangler viewet
 * eller feiler spørringen, brukes de målte totalene fra dashboard.followers som før.
 */
export async function getFollowerPoints(): Promise<Result<FollowerPointRow[]>> {
  return keep(await selectAll<FollowerPointRow>("follower_points", "*", "account_id,day"), onlyKnownPlatforms);
}

export async function getDailyActivity(): Promise<Result<DailyActivityRow[]>> {
  return keep(await selectAll<DailyActivityRow>("daily_activity", "*", "account_id,activity_date,format"), onlyKnownPlatforms);
}

/**
 * dashboard.post_features (2026-10-16_post_features.sql): én rad per innlegg til analysen på tips-siden.
 * Instagram bare Reels, YouTube bare Shorts; analyse.ts filtrerer resten (modne, uten spesiell hendelse).
 */
export async function getPostFeatures(): Promise<Result<FeatureRow[]>> {
  return keep(
    await selectAll<FeatureRow>(
      "post_features",
      "platform,account_id,content_id,format,concept,special_event,published_at,weekday,hour,hashtag_count,hashtags,text_length,duration_s,duration_source,views,is_mature",
      "platform,content_id",
    ),
    onlyKnown,
  );
}

/**
 * dashboard.planned_posts (2026-10-21_planned_posts.sql): den delte publiseringskalenderen. Valgfri: finnes ikke
 * viewet ennå (før migreringen) eller feiler lesingen, viser Publiseringstid nettleserkøen i stedet.
 */
export async function getPlannedPosts(): Promise<Result<Record<string, unknown>[]>> {
  return selectAll<Record<string, unknown>>("planned_posts", "*", "aar,uke,id");
}

/** Om innlogget bruker kan skrive i kalenderen (planlegging.er_redaktor). False ved feil eller manglende funksjon. */
export async function erRedaktor(): Promise<boolean> {
  try {
    const { data, error } = await (await createClient()).schema("planlegging").rpc("er_redaktor");
    return !error && data === true;
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
}
