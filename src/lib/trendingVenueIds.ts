import { LAUNCH_ZONES } from "@/lib/launchZone";
import { mapConsumerVenue } from "@/lib/consumerVenue";
import { getCharlotteTimeParts } from "@/lib/openNow";
import { sql } from "@/lib/db";
import type { ConsumerVenue } from "@/types";

export const TRENDING_VENUE_LIMIT = 5;
const QUERY_LIMIT = 100;
const LAUNCH_ZONE_IDS = LAUNCH_ZONES.map((zone) => zone.id);

const TRENDING_VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id, hidden,
  updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source,
    confidence_0_1, computed_at, last_busyness_refresh
  )
`;

const TRENDING_VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url,
  open_now, hidden, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source,
    confidence_0_1, computed_at, last_busyness_refresh
  )
`;

export type TrendingVenueScore = {
  venue: ConsumerVenue;
  score: number;
};

type TrendingVenueRow = Record<string, unknown>;

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

function getBusyness0To100(venue: ConsumerVenue): number {
  const busyness = venue.signal?.busyness0To100;
  if (typeof busyness !== "number" || !Number.isFinite(busyness)) return 0;
  return Math.max(0, Math.min(100, busyness));
}

function getNightHoursMultiplier(now = new Date()): number {
  const charlotteTime = getCharlotteTimeParts(now);
  const isWeekendNight = charlotteTime.day === 5 || charlotteTime.day === 6;
  const weekendMultiplier = isWeekendNight ? 1.2 : 1;

  if (charlotteTime.hour >= 21 || charlotteTime.hour <= 2) {
    return 1.3 * weekendMultiplier;
  }

  if (charlotteTime.hour >= 18 && charlotteTime.hour < 21) {
    return 1.1 * weekendMultiplier;
  }

  return 1;
}

export function scoreTrendingVenue(
  venue: ConsumerVenue,
  now = new Date(),
): number {
  const busynessScore = (getBusyness0To100(venue) / 100) * 0.5;
  const openNowScore = venue.openNow === true ? 0.2 : 0;
  return (busynessScore + openNowScore) * getNightHoursMultiplier(now);
}

export function rankTrendingVenueRows(
  rows: TrendingVenueRow[],
  limit = TRENDING_VENUE_LIMIT,
  now = new Date(),
): TrendingVenueScore[] {
  const mapped = rows
    .filter((row) => row.hidden !== true)
    .filter((row) => row.open_now !== false)
    .map((row) => ({
      venue: mapConsumerVenue(row),
    }))
    .filter((item) => item.venue.openNow !== false);

  return mapped
    .map((item) => ({
      ...item,
      score: scoreTrendingVenue(item.venue, now),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
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

async function fetchTrendingRows(_select: string) {
  const data = await sql`
    SELECT
      v.*,
      to_jsonb(vs) AS venue_signals
    FROM venues v
    LEFT JOIN venue_signals vs ON vs.venue_id = v.id
    WHERE COALESCE(v.hidden, false) = false
      AND v.zone_id = ANY(${LAUNCH_ZONE_IDS}::text[])
    LIMIT ${QUERY_LIMIT}
  `;
  return { data, error: null };
}

export async function getTrendingVenues(now = new Date()): Promise<ConsumerVenue[]> {
  const primaryResult = await fetchTrendingRows(TRENDING_VENUE_SELECT);

  let rows = primaryResult.data as TrendingVenueRow[] | null;
  let error = primaryResult.error;

  if (error && isMissingOptionalVenueColumn(error)) {
    const legacyResult = await fetchTrendingRows(TRENDING_VENUE_SELECT_LEGACY);
    rows = legacyResult.data as TrendingVenueRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    const errMsg = String((error as Record<string, unknown>)?.message ?? error);
    throw new Error(errMsg);
  }

  return rankTrendingVenueRows(rows ?? [], TRENDING_VENUE_LIMIT, now).map((item) => item.venue);
}
