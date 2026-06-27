import { LAUNCH_ZONES } from "@/lib/launchZone";
import { mapConsumerVenue } from "@/lib/consumerVenue";
import { supabaseAdmin } from "@/lib/supabase";
import type { ConsumerVenue } from "@/types";

export const TRENDING_VENUE_LIMIT = 5;
const RECENT_CHECK_IN_WINDOW_MS = 2 * 60 * 60 * 1000;
const QUERY_LIMIT = 100;
const LAUNCH_ZONE_IDS = LAUNCH_ZONES.map((zone) => zone.id);

const TRENDING_VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id, hidden,
  updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  ),
  check_ins (
    venue_id, created_at, hidden
  )
`;

const TRENDING_VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url,
  open_now, hidden, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  ),
  check_ins (
    venue_id, created_at, hidden
  )
`;

export type TrendingVenueScore = {
  venue: ConsumerVenue;
  checkInsLast2h: number;
  score: number;
};

type TrendingVenueRow = Record<string, unknown> & {
  check_ins?: unknown;
};

function isMissingOptionalVenueColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
  return (
    message.includes("'phone' column") ||
    message.includes("'phone_number' column") ||
    message.includes("'website' column") ||
    message.includes("'google_maps_uri' column") ||
    message.includes("'editorial_summary' column") ||
    message.includes("'user_rating_count' column") ||
    message.includes("'photo_urls' column") ||
    message.includes("'neighborhood' column") ||
    message.includes("'besttime_venue_id' column") ||
    message.includes("venues.phone") ||
    message.includes("venues.phone_number") ||
    message.includes("venues.website") ||
    message.includes("venues.google_maps_uri") ||
    message.includes("venues.editorial_summary") ||
    message.includes("venues.user_rating_count") ||
    message.includes("venues.photo_urls") ||
    message.includes("venues.neighborhood") ||
    message.includes("venues.besttime_venue_id")
  );
}

function isRecentVisibleCheckIn(row: unknown): row is { created_at: string; hidden?: boolean | null } {
  if (!row || typeof row !== "object") return false;
  const checkIn = row as { created_at?: unknown; hidden?: unknown };
  return typeof checkIn.created_at === "string" && checkIn.hidden !== true;
}

function countRecentCheckIns(row: TrendingVenueRow): number {
  if (!Array.isArray(row.check_ins)) return 0;
  return row.check_ins.filter(isRecentVisibleCheckIn).length;
}

function getBusyness0To100(venue: ConsumerVenue): number {
  const busyness = venue.signal?.busyness0To100;
  if (typeof busyness !== "number" || !Number.isFinite(busyness)) return 0;
  return Math.max(0, Math.min(100, busyness));
}

export function scoreTrendingVenue(
  venue: ConsumerVenue,
  checkInsLast2h: number,
  maxCheckIns: number,
): number {
  const busynessScore = (getBusyness0To100(venue) / 100) * 0.5;
  const checkInScore = maxCheckIns > 0 ? (checkInsLast2h / maxCheckIns) * 0.3 : 0;
  const openNowScore = venue.openNow === true ? 0.2 : 0;
  const baseScore = busynessScore + checkInScore + openNowScore;
  return checkInsLast2h > 0 ? baseScore * 1.5 : baseScore;
}

export function rankTrendingVenueRows(rows: TrendingVenueRow[], limit = TRENDING_VENUE_LIMIT): TrendingVenueScore[] {
  const mapped = rows
    .filter((row) => row.hidden !== true)
    .filter((row) => row.open_now !== false)
    .map((row) => ({
      venue: mapConsumerVenue(row),
      checkInsLast2h: countRecentCheckIns(row),
    }))
    .filter((item) => item.venue.openNow !== false);

  const maxCheckIns = mapped.reduce((max, item) => Math.max(max, item.checkInsLast2h), 0);

  return mapped
    .map((item) => ({
      ...item,
      score: scoreTrendingVenue(item.venue, item.checkInsLast2h, maxCheckIns),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.checkInsLast2h !== a.checkInsLast2h) return b.checkInsLast2h - a.checkInsLast2h;
      const busynessDelta = getBusyness0To100(b.venue) - getBusyness0To100(a.venue);
      if (busynessDelta !== 0) return busynessDelta;
      const aRating = a.venue.rating ?? a.venue.googleRating ?? null;
      const bRating = b.venue.rating ?? b.venue.googleRating ?? null;
      if (aRating == null && bRating == null) return a.venue.name.localeCompare(b.venue.name);
      if (aRating == null) return 1;
      if (bRating == null) return -1;
      return bRating - aRating || a.venue.name.localeCompare(b.venue.name);
    })
    .slice(0, limit);
}

async function fetchTrendingRows(select: string, sinceIso: string) {
  return supabaseAdmin
    .from("venues")
    .select(select)
    .eq("hidden", false)
    .in("zone_id", LAUNCH_ZONE_IDS)
    .gte("check_ins.created_at", sinceIso)
    .eq("check_ins.hidden", false)
    .limit(QUERY_LIMIT);
}

export async function getTrendingVenues(now = new Date()): Promise<ConsumerVenue[]> {
  const sinceIso = new Date(now.getTime() - RECENT_CHECK_IN_WINDOW_MS).toISOString();
  const primaryResult = await fetchTrendingRows(TRENDING_VENUE_SELECT, sinceIso);

  let rows = primaryResult.data as TrendingVenueRow[] | null;
  let error = primaryResult.error;

  if (error && isMissingOptionalVenueColumn(error)) {
    const legacyResult = await fetchTrendingRows(TRENDING_VENUE_SELECT_LEGACY, sinceIso);
    rows = legacyResult.data as TrendingVenueRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    throw new Error(error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error));
  }

  return rankTrendingVenueRows(rows ?? []).map((item) => item.venue);
}
