import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { inferOpenNow, getCharlotteTimeParts } from "@/lib/openNow";
import type { ConsumerVenue, VenueSignal } from "@/types";

export const CONSUMER_VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id, hidden,
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
      : value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { weekday_text?: unknown }).weekday_text)
        ? (value as { weekday_text: unknown[] }).weekday_text
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
  const signal = mapSignal(signalRow);

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
    rating: row.rating == null ? null : Number(row.rating),
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    userRatingCount: row.user_rating_count == null ? null : Number(row.user_rating_count),
    priceLevel: row.price_level == null ? null : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    photoUrls: mapPhotoUrls(row.photo_urls),
    phone: (row.phone ?? row.phone_number ?? undefined) as string | undefined,
    phoneNumber: (row.phone_number ?? row.phone ?? undefined) as string | undefined,
    website: (row.website ?? undefined) as string | undefined,
    googleMapsUri: (row.google_maps_uri ?? undefined) as string | undefined,
    editorialSummary: (row.editorial_summary ?? undefined) as string | undefined,
    openingHours: mapOpeningHours(row.opening_hours),
    openNow: (() => {
      if (row.open_now != null) return Boolean(row.open_now);
      try {
        return inferOpenNow((row.category ?? row.venue_type) as string | null, getCharlotteTimeParts(), row.opening_hours);
      } catch {
        return null;
      }
    })(),
    besttimeVenueId: (row.besttime_venue_id ?? undefined) as string | undefined,
    hidden: Boolean(row.hidden),
    signal,
    mf_ratio: signal?.mfRatio ?? null,
    mf_sample_size: signal?.sampleSize ?? 0,
  };
}

function isMissingContactColumn(error: unknown): boolean {
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

export async function getConsumerVenueById(id: string): Promise<ConsumerVenue | null> {
  const venueId = normalizeVenueLookupId(id);
  if (!venueId) return null;

  const primaryResult = await findVisibleVenueByIdOrPlaceId(venueId, CONSUMER_VENUE_SELECT);

  let data = primaryResult.data as Record<string, unknown> | null;
  let error = primaryResult.error;

  if (error && isMissingContactColumn(error)) {
      const legacyResult = await findVisibleVenueByIdOrPlaceId(venueId, CONSUMER_VENUE_SELECT_LEGACY);

    data = legacyResult.data as Record<string, unknown> | null;
    error = legacyResult.error;
  }

  if (error || !data) return null;
  try {
    return mapConsumerVenue(data);
  } catch {
    return null;
  }
}
