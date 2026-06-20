// ============================================================
// GET /api/venues
// Consumer cached venue list for the locked launch zone.
// No Google/BestTime calls happen during normal page reads.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { LAUNCH_ZONE } from "@/lib/launchZone";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

function mapSignal(row: Record<string, unknown> | undefined): VenueSignal | undefined {
  if (!row) return undefined;
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
    placeId: row.place_id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    address: row.address as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    hidden: Boolean(row.hidden),
    signal: mapSignal(signalRows[0]),
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = checkRateLimit(`venues:${ip}`, 60, 60_000);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 429, headers: { "Retry-After": String(retrySeconds) } }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(`
      id, place_id, zone_id, name, address, lat, lng, venue_type, category,
      google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
      venue_signals (
        venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
        confidence_0_1, sample_size, computed_at, last_busyness_refresh
      )
    `)
    .eq("zone_id", LAUNCH_ZONE.id)
    .eq("hidden", false)
    .order("name", { ascending: true });

  if (error) {
    console.error("[venues] cached DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load cached venues." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 500 }
    );
  }

  const venues = ((data ?? []) as Record<string, unknown>[]).map(mapVenue).sort((a, b) => {
    const aBusyness = a.signal?.busyness0To100;
    const bBusyness = b.signal?.busyness0To100;

    if (aBusyness == null && bBusyness == null) return a.name.localeCompare(b.name);
    if (aBusyness == null) return 1;
    if (bBusyness == null) return -1;
    if (bBusyness !== aBusyness) return bBusyness - aBusyness;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json<APIResponse<{ zone: typeof LAUNCH_ZONE; venues: ConsumerVenue[] }>>({
    status: "success",
    data: { zone: LAUNCH_ZONE, venues },
    meta: { cached: true, generatedAt, requestId },
  });
}
