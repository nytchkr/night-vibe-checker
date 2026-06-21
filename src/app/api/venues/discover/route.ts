// ============================================================
// GET /api/venues/discover
// Triggers Google Places Nearby Search for the South End launch
// zone, upserts results into the venues table, and returns the
// full list of upserted venues.
//
// Protected by x-cron-secret header. Call this from a Vercel
// cron job or manually with:
//   curl -H "x-cron-secret: $CRON_SECRET" \
//        https://night-vibe-checker.vercel.app/api/venues/discover
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { LAUNCH_ZONE } from "@/lib/launchZone";
import { discoverZone } from "@/lib/places";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue } from "@/types";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();

  if (!isAuthorized(req)) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "UNAUTHORIZED", message: "Missing or invalid x-cron-secret header." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 401 }
    );
  }

  let discovered;
  try {
    discovered = await discoverZone(LAUNCH_ZONE);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Places API error.";
    console.error("[venues/discover] Places API error:", message);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "PLACES_ERROR", message },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 502 }
    );
  }

  const now = generatedAt;
  const rows = discovered.map((venue) => ({
    place_id: venue.placeId,
    zone_id: venue.zoneId,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    venue_type: venue.category,
    category: venue.category,
    google_rating: venue.googleRating ?? null,
    total_ratings: venue.totalRatings ?? null,
    price_level: venue.priceLevel ?? null,
    photo_reference: venue.photoReference ?? null,
    photo_url: venue.photoUrl ?? null,
    opening_hours: venue.openingHours ?? null,
    open_now: venue.openNow ?? null,
    updated_at: now,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("venues")
    .upsert(rows, { onConflict: "place_id" });

  if (upsertError) {
    console.error("[venues/discover] upsert failed:", upsertError);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Failed to upsert venues into database." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 500 }
    );
  }

  // Return the venues we just upserted from the DB to confirm persisted state
  const { data: venueRows, error: fetchError } = await supabaseAdmin
    .from("venues")
    .select("id, slug, place_id, zone_id, name, address, lat, lng, category, google_rating, total_ratings, price_level, photo_reference, photo_url, opening_hours, open_now, hidden")
    .eq("zone_id", LAUNCH_ZONE.id)
    .eq("hidden", false)
    .order("name", { ascending: true });

  if (fetchError) {
    console.error("[venues/discover] post-upsert fetch failed:", fetchError);
    // Still return success — the upsert worked; we just can't return the list
    return NextResponse.json<APIResponse<{ zone: typeof LAUNCH_ZONE; discovered: number }>>({
      status: "success",
      data: { zone: LAUNCH_ZONE, discovered: discovered.length },
      meta: { cached: false, generatedAt, requestId },
    });
  }

  const venues: ConsumerVenue[] = ((venueRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    slug: (row.slug ?? undefined) as string | undefined,
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
    openingHours: Array.isArray(row.opening_hours)
      ? row.opening_hours.filter((item): item is string => typeof item === "string" && item.length > 0)
      : undefined,
    openNow: row.open_now == null ? undefined : Boolean(row.open_now),
    hidden: Boolean(row.hidden),
    signal: null,
  }));

  return NextResponse.json<APIResponse<{ zone: typeof LAUNCH_ZONE; venues: ConsumerVenue[]; discovered: number }>>({
    status: "success",
    data: { zone: LAUNCH_ZONE, venues, discovered: discovered.length },
    meta: { cached: false, generatedAt, requestId },
  });
}
