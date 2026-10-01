// Radtyper for viewene i schema dashboard. Må holdes i takt med supabase/schema.sql.
// Tallkolonner fra percentile_cont (median_*) er double precision og kan være null.
// Datoer og tidspunkter kommer som ISO-strenger fra PostgREST.

export type Platform = "instagram" | "youtube";

/** Instagram: REELS / FEED. YouTube: SHORTS (VIDEO er holdt utenfor i viewet). */
export type Format = "REELS" | "FEED" | "SHORTS";

/** dashboard.content_latest: én rad per innlegg/video, siste måling. */
export type ContentLatestRow = {
  platform: Platform;
  account_id: number;
  content_id: string;
  /** Lokal Oslo-tid uten tidssone, f.eks. "2026-09-28T18:01:25". */
  published_at: string;
  format: Format;
  concept: string | null;
  special_event: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  age_days: number;
  /** Minst 7 dager gammelt. */
  is_mature: boolean;
  title: string | null;
  permalink: string | null;
  /** timestamptz, f.eks. "2026-09-30T09:55:16.239042+00:00". */
  fetched_at: string | null;
};

/** dashboard.concept_summary: median per plattform + konto + format + konsept + special_event. */
export type ConceptSummaryRow = {
  platform: Platform;
  account_id: number;
  format: Format;
  concept: string | null;
  special_event: string | null;
  posts: number;
  median_views: number | null;
  median_likes: number | null;
  median_comments: number | null;
  /** Under 6 innlegg. */
  preliminary: boolean;
  /** Median av (likes + comments) / views. Sammenlign bare innenfor samme plattform og format. */
  median_engagement_per_view: number | null;
};

export type PeriodType = "uke" | "måned";

/** dashboard.platform_summary: per plattform + konto + format + periode, med forrige periode. */
export type PlatformSummaryRow = {
  platform: Platform;
  account_id: number;
  format: Format;
  period_type: PeriodType;
  /** Dato, "YYYY-MM-DD". */
  period_start: string;
  period_end: string;
  period_complete: boolean;
  published: number;
  mature_posts: number;
  median_views: number | null;
  /** Gjelder hele kontoen, likt for alle formater på samme konto. */
  new_followers: number | null;
  days_with_follower_data: number;
  followers_end: number | null;
  prev_published: number | null;
  prev_mature_posts: number | null;
  prev_median_views: number | null;
  prev_new_followers: number | null;
  prev_days_with_follower_data: number | null;
  prev_followers_end: number | null;
};

/** Format i dashboard.daily_activity (AD og OTHER er holdt utenfor i viewet). */
export type ActivityFormat = "ALL" | "REELS" | "FEED" | "STORY" | "SHORTS" | "VIDEO";

/**
 * dashboard.daily_activity: aktivitet på hele kontoen per døgn og format, også på eldre innlegg.
 * Døgnene følger Stillehavstid (Metas og YouTube Analytics' egne døgn).
 */
export type DailyActivityRow = {
  platform: Platform;
  account_id: number;
  /** Stillehavsdøgn, "YYYY-MM-DD". */
  activity_date: string;
  format: ActivityFormat;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Null for YouTube. */
  saves: number | null;
  interactions: number | null;
  /** Siste døgn med data for kontoen (YouTube ligger 2–3 døgn bak). */
  data_through: string;
  /** Når Nordbø Marketing tok over kontoen. */
  takeover_date: string | null;
};

export type DashboardView = "content_latest" | "concept_summary" | "platform_summary" | "daily_activity";

/** Resultat av en spørring: enten data, eller en feil som kan vises rolig til brukeren. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
