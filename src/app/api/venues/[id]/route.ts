// ============================================================
// GET /api/venues/[id]
// Cached venue detail. No external calls.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

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
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

function mapVenue(row: Record<string, unknown>): ConsumerVenue {
  const signalRows = (row.venue_signals ?? []) as Record<string, unknown>[];
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
    openNow: row.open_now == null ? undefined : Boolean(row.open_now),
    hidden: Boolean(row.hidden),
    signal: mapSignal(signalRows[0]),
  };
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
  const id = rawId?.trim();
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

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(`
      id, place_id, zone_id, name, address, lat, lng, venue_type, category,
      slug,
      rating, google_rating, total_ratings, price_level, photo_reference, photo_url, open_now, hidden,
      venue_signals (
        venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
        confidence_0_1, sample_size, computed_at, last_busyness_refresh
      )
    `)
    .or(`id.eq.${id},place_id.eq.${id}`)
    .eq("hidden", false)
    .limit(1)
    .single();

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
    { headers }
  );
}
