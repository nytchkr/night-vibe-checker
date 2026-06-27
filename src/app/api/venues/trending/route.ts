// ============================================================
// GET /api/venues/trending
// Top visible launch-zone venues by recent check-in activity.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { inferCanonicalOpenNow } from "@/lib/openNow";
import { mapGoogleOpeningHours } from "@/lib/venueHours";
import { v4 as uuidv4 } from "uuid";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

const TRENDING_LIMIT = 5;
const TRENDING_WINDOW_MS = 24 * 60 * 60 * 1000;
const LAUNCH_ZONE_IDS = LAUNCH_ZONES.map((zone) => zone.id);

const VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
  phone, website, opening_hours, open_now, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

const VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
  open_now, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  )
`;

export const dynamic = "force-dynamic";

const EDGE_CACHE_HEADERS = {
  "Cache-Control": "s-maxage=120, stale-while-revalidate=600",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

type RecentCheckInRow = {
  venue_id: string | null;
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

function mapVenue(row: Record<string, unknown>, openNow: boolean | null): ConsumerVenue {
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
    rating: row.rating == null ? undefined : Number(row.rating),
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    phone: (row.phone ?? undefined) as string | undefined,
    website: (row.website ?? undefined) as string | undefined,
    openingHours: mapGoogleOpeningHours(row.opening_hours),
    openNow,
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

  const since = new Date(Date.now() - TRENDING_WINDOW_MS).toISOString();
  const checkInsResult = await supabaseAdmin
    .from("check_ins")
    .select("venue_id, created_at")
    .gte("created_at", since)
    .eq("hidden", false)
    .limit(500);

  if (checkInsResult.error) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load recent check-ins." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 500, headers: { ...headers, ...NO_STORE_HEADERS } }
    );
  }

  const checkInCounts = new Map<string, number>();
  for (const row of ((checkInsResult.data ?? []) as RecentCheckInRow[])) {
    const venueId = typeof row.venue_id === "string" ? row.venue_id.trim() : "";
    if (!venueId) continue;
    checkInCounts.set(venueId, (checkInCounts.get(venueId) ?? 0) + 1);
  }

  const recentVenueIds = Array.from(checkInCounts.keys());
  if (recentVenueIds.length === 0) {
    return NextResponse.json<APIResponse<{ venues: ConsumerVenue[] }>>(
      {
        status: "success",
        data: { venues: [] },
        meta: { cached: false, generatedAt, requestId },
      },
      { headers: { ...headers, ...EDGE_CACHE_HEADERS } }
    );
  }

  const primaryResult = await supabaseAdmin
    .from("venues")
    .select(VENUE_SELECT)
    .eq("hidden", false)
    .in("zone_id", LAUNCH_ZONE_IDS)
    .in("id", recentVenueIds)
    .limit(100);
  let venuesData = primaryResult.data as Record<string, unknown>[] | null;
  let venuesError = primaryResult.error;

  if (venuesError && isMissingContactColumn(venuesError)) {
    const legacyResult = await supabaseAdmin
      .from("venues")
      .select(VENUE_SELECT_LEGACY)
      .eq("hidden", false)
      .in("zone_id", LAUNCH_ZONE_IDS)
      .in("id", recentVenueIds)
      .limit(100);
    venuesData = legacyResult.data as Record<string, unknown>[] | null;
    venuesError = legacyResult.error;
  }

  if (venuesError) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load trending venues." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 500, headers: { ...headers, ...NO_STORE_HEADERS } }
    );
  }

  const venues = (venuesData ?? [])
    .map((row) => ({
      row,
      openNow: inferCanonicalOpenNow({
        category: (row.category ?? row.venue_type) as string | null,
        openingHours: row.opening_hours,
        refreshedAt: row.updated_at,
      }),
    }))
    .filter(({ openNow }) => openNow === true)
    .map(({ row, openNow }) => mapVenue(row, openNow))
    .sort((a, b) => {
      const checkInDelta = (checkInCounts.get(b.id) ?? 0) - (checkInCounts.get(a.id) ?? 0);
      if (checkInDelta !== 0) return checkInDelta;
      const aBusyness = a.signal?.busyness0To100 ?? -1;
      const bBusyness = b.signal?.busyness0To100 ?? -1;
      if (bBusyness !== aBusyness) return bBusyness - aBusyness;
      const aRating = a.rating ?? a.googleRating ?? null;
      const bRating = b.rating ?? b.googleRating ?? null;
      if (aRating == null && bRating == null) return a.name.localeCompare(b.name);
      if (aRating == null) return 1;
      if (bRating == null) return -1;
      return bRating - aRating || a.name.localeCompare(b.name);
    })
    .slice(0, TRENDING_LIMIT);

  return NextResponse.json<APIResponse<{ venues: ConsumerVenue[] }>>(
    {
      status: "success",
      data: { venues },
      meta: { cached: false, generatedAt, requestId },
    },
    { headers: { ...headers, ...EDGE_CACHE_HEADERS } }
  );
}
