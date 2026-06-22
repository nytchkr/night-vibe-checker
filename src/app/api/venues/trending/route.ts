// ============================================================
// GET /api/venues/trending
// Top visible launch-zone venues by current busyness signal.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";
import { LAUNCH_ZONE } from "@/lib/launchZone";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

const TRENDING_LIMIT = 5;

const VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
  phone, website, opening_hours, open_now,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

const VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
  open_now,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
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

function mapOpeningHours(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hours = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return hours.length ? hours : undefined;
}

function mapVenue(row: Record<string, unknown>): ConsumerVenue {
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
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    rating: row.rating == null ? undefined : Number(row.rating),
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
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
    message.includes("venues.phone") ||
    message.includes("venues.website")
  );
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const rate = checkRateLimit(`venues:trending:${getClientIp(req)}`, 60, 60_000);
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

  const primaryResult = await supabaseAdmin
    .from("venues")
    .select(VENUE_SELECT)
    .eq("hidden", false)
    .eq("zone_id", LAUNCH_ZONE.id)
    .limit(100);
  let venuesData = primaryResult.data as Record<string, unknown>[] | null;
  let venuesError = primaryResult.error;

  if (venuesError && isMissingContactColumn(venuesError)) {
    const legacyResult = await supabaseAdmin
      .from("venues")
      .select(VENUE_SELECT_LEGACY)
      .eq("hidden", false)
      .eq("zone_id", LAUNCH_ZONE.id)
      .limit(100);
    venuesData = legacyResult.data as Record<string, unknown>[] | null;
    venuesError = legacyResult.error;
  }

  if (venuesError) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load trending venues." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 500, headers }
    );
  }

  const venues = (venuesData ?? [])
    .map(mapVenue)
    .filter((venue) => venue.signal?.busyness0To100 != null)
    .sort((a, b) => {
      const aBusyness = a.signal?.busyness0To100 ?? -1;
      const bBusyness = b.signal?.busyness0To100 ?? -1;
      return bBusyness - aBusyness || a.name.localeCompare(b.name);
    })
    .slice(0, TRENDING_LIMIT)

  return NextResponse.json<APIResponse<{ venues: ConsumerVenue[] }>>(
    {
      status: "success",
      data: { venues },
      meta: { cached: true, generatedAt, requestId },
    },
    { headers: { ...headers, ...PUBLIC_CACHE_HEADERS } }
  );
}
