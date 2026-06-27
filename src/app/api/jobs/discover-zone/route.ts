import { NextRequest, NextResponse } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { discoverZone, PlacesApiError } from "@/lib/places";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import type { DiscoveredVenue } from "@/lib/places";

function isAuthorized(req: NextRequest) {
  return isAuthorizedCronRequest(req);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const venuesByPlaceId = new Map<string, DiscoveredVenue>();
  const discoveredByZone: Record<string, number> = {};
  try {
    for (const zone of LAUNCH_ZONES) {
      const venues = await discoverZone(zone);
      discoveredByZone[zone.id] = venues.length;
      for (const venue of venues.map((item) => ({ ...item, zoneId: zone.id }))) {
        if (!venuesByPlaceId.has(venue.placeId)) {
          venuesByPlaceId.set(venue.placeId, venue);
        }
      }
    }
  } catch (error) {
    console.error("[discover-zone] Places discovery failed:", error);
    const status = error instanceof PlacesApiError ? error.statusCode : 500;
    return NextResponse.json(
      { status: "error", error: { code: "PLACES_ERROR", message: "Places discovery failed." } },
      { status }
    );
  }

  // Ensure all zone rows exist before upserting venues (FK constraint on venues.zone_id)
  const { error: zoneError } = await supabaseAdmin.from("zones").upsert(
    LAUNCH_ZONES.map((z) => ({
      id: z.id,
      name: z.name,
      center_lat: z.center_lat,
      center_lng: z.center_lng,
      radius_m: z.radius_m,
    })),
    { onConflict: "id" }
  );
  if (zoneError) {
    console.error("[discover-zone] zone upsert failed:", zoneError);
    return NextResponse.json({ status: "error", error: { code: "DB_ERROR" } }, { status: 500 });
  }

  const venues = Array.from(venuesByPlaceId.values());
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("venues").upsert(
    venues.map((venue) => ({
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
      photo_urls: venue.photoUrls ?? [],
      updated_at: now,
    })),
    { onConflict: "place_id" }
  );

  if (error) {
    console.error("[discover-zone] upsert failed:", error);
    return NextResponse.json({ status: "error", error: { code: "DB_ERROR" } }, { status: 500 });
  }

  return NextResponse.json({ status: "success", data: { zones: LAUNCH_ZONES, discovered: venues.length, discoveredByZone } });
}

export const GET = POST;
