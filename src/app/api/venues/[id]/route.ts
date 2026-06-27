// ============================================================
// GET /api/venues/[id]
// Cached venue detail. No external calls.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { inferCanonicalOpenNow } from "@/lib/openNow";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { mapGoogleOpeningHours } from "@/lib/venueHours";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

const VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id, hidden,
  updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

const VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url,
  open_now, hidden, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

export const dynamic = "force-dynamic";

const EDGE_CACHE_HEADERS = {
  "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
};

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

function mapPhotoUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return urls.length ? urls : undefined;
}

function mapVenue(row: Record<string, unknown>): ConsumerVenue {
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
    openingHours: mapGoogleOpeningHours(row.opening_hours),
    openNow: inferCanonicalOpenNow({
      category: (row.category ?? row.venue_type) as string | null,
      openingHours: row.opening_hours,
      refreshedAt: row.updated_at,
    }),
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
    message.includes("'besttime_venue_id' column") ||
    message.includes("venues.phone") ||
    message.includes("venues.phone_number") ||
    message.includes("venues.website") ||
    message.includes("venues.google_maps_uri") ||
    message.includes("venues.editorial_summary") ||
    message.includes("venues.user_rating_count") ||
    message.includes("venues.photo_urls") ||
    message.includes("venues.besttime_venue_id")
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = checkRateLimit(`venues-detail:${ip}`, 60, 60_000);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } }
    );
  }

  const { id: rawId } = await params;
  const id = normalizeVenueLookupId(rawId);
  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 400, headers }
    );
  }

  try {
    const primaryResult = await findVisibleVenueByIdOrPlaceId(id, VENUE_SELECT);
    let data = primaryResult.data as Record<string, unknown> | null;
    let error = primaryResult.error;

    if (error && isMissingContactColumn(error)) {
      const legacyResult = await findVisibleVenueByIdOrPlaceId(id, VENUE_SELECT_LEGACY);
      data = legacyResult.data as Record<string, unknown> | null;
      error = legacyResult.error;
    }

    if (error || !data) {
      return NextResponse.json<APIResponse<never>>(
        {
          status: "error",
          error: { code: "VENUE_NOT_FOUND", message: "Venue was not found in the cached launch-zone database." },
          meta: { cached: true, generatedAt, requestId },
        },
        { status: 404, headers }
      );
    }

    return NextResponse.json<APIResponse<{ venue: ConsumerVenue }>>(
      {
        status: "success",
        data: { venue: mapVenue(data as Record<string, unknown>) },
        meta: { cached: true, generatedAt, requestId },
      },
      { headers: { ...headers, ...EDGE_CACHE_HEADERS } }
    );
  } catch (error) {
    console.error("[venues detail] unexpected error:", error);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load cached venue." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 500, headers }
    );
  }
}
