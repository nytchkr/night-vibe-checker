import { supabaseAdmin } from "@/lib/supabase";
import type { ConsumerVenue, VenueSignal } from "@/types";

export const CONSUMER_VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, photo_urls,
  phone, website, opening_hours, open_now, hidden,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

const CONSUMER_VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url,
  open_now, hidden,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

function mapSignal(row: Record<string, unknown> | undefined): VenueSignal | null {
  if (!row) return null;
  return {
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    busyness0To100: (row.busyness_0_100 ?? null) as number | null,
    busynessSource: (row.busyness_source ?? null) as VenueSignal["busynessSource"],
    mfRatio: (row.mf_ratio ?? null) as number | null,
    confidence0To1: Number(row.confidence_0_1 ?? 0),
    sampleSize: Number(row.sample_size ?? 0),
    computedAt: row.computed_at as string,
    updatedAt: (row.updated_at ?? null) as string | null,
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

function mapOpeningHours(value: unknown): string[] | undefined {
  const rawHours =
    value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { weekdayDescriptions?: unknown }).weekdayDescriptions)
      ? (value as { weekdayDescriptions: unknown[] }).weekdayDescriptions
      : value;

  if (!Array.isArray(rawHours)) return undefined;
  const hours = rawHours.filter((item): item is string => typeof item === "string" && item.length > 0);
  return hours.length ? hours : undefined;
}

function mapPhotoUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return urls.length ? urls : undefined;
}

export function mapConsumerVenue(row: Record<string, unknown>): ConsumerVenue {
  const sig = row.venue_signals;
  const signalRow: Record<string, unknown> | undefined = Array.isArray(sig)
    ? (sig[0] as Record<string, unknown> | undefined)
    : sig != null
      ? (sig as Record<string, unknown>)
      : undefined;

  return {
    id: row.id as string,
    slug: (row.slug ?? undefined) as string | undefined,
    placeId: row.place_id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    address: row.address as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    neighborhood: (row.neighborhood ?? undefined) as string | undefined,
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    rating: row.rating == null ? undefined : Number(row.rating),
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    photoUrls: mapPhotoUrls(row.photo_urls),
    phone: (row.phone ?? undefined) as string | undefined,
    website: (row.website ?? undefined) as string | undefined,
    openingHours: mapOpeningHours(row.opening_hours),
    openNow: row.open_now == null ? undefined : Boolean(row.open_now),
    hidden: Boolean(row.hidden),
    signal: mapSignal(signalRow),
  };
}

function isMissingContactColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
  return (
    message.includes("'phone' column") ||
    message.includes("'website' column") ||
    message.includes("'photo_urls' column") ||
    message.includes("'neighborhood' column") ||
    message.includes("venues.phone") ||
    message.includes("venues.website") ||
    message.includes("venues.photo_urls") ||
    message.includes("venues.neighborhood")
  );
}

export async function getConsumerVenueById(id: string): Promise<ConsumerVenue | null> {
  const venueId = decodeURIComponent(id).trim();
  if (!venueId) return null;

  const primaryResult = await supabaseAdmin
    .from("venues")
    .select(CONSUMER_VENUE_SELECT)
    .or(`id.eq.${venueId},place_id.eq.${venueId}`)
    .eq("hidden", false)
    .limit(1)
    .maybeSingle();

  let data = primaryResult.data as Record<string, unknown> | null;
  let error = primaryResult.error;

  if (error && isMissingContactColumn(error)) {
    const legacyResult = await supabaseAdmin
      .from("venues")
      .select(CONSUMER_VENUE_SELECT_LEGACY)
      .or(`id.eq.${venueId},place_id.eq.${venueId}`)
      .eq("hidden", false)
      .limit(1)
      .maybeSingle();

    data = legacyResult.data as Record<string, unknown> | null;
    error = legacyResult.error;
  }

  if (error || !data) return null;
  return mapConsumerVenue(data);
}
