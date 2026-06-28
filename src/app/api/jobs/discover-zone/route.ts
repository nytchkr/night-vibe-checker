import { NextRequest, NextResponse } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { discoverZone, PlacesApiError } from "@/lib/places";
import { sql } from "@/lib/db";
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
  for (const zone of LAUNCH_ZONES) {
    await sql`
      INSERT INTO zones (id, name, center_lat, center_lng, radius_m)
      VALUES (${zone.id}, ${zone.name}, ${zone.center_lat}, ${zone.center_lng}, ${zone.radius_m})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        center_lat = EXCLUDED.center_lat,
        center_lng = EXCLUDED.center_lng,
        radius_m = EXCLUDED.radius_m
    `;
  }

  const venues = Array.from(venuesByPlaceId.values());
  const now = new Date().toISOString();
  for (const venue of venues) {
    await sql`
      INSERT INTO venues (
        place_id, zone_id, name, address, lat, lng, venue_type, category, google_rating,
        total_ratings, price_level, photo_reference, photo_url, photo_urls, updated_at
      )
      VALUES (
        ${venue.placeId}, ${venue.zoneId}, ${venue.name}, ${venue.address}, ${venue.lat}, ${venue.lng},
        ${venue.category}, ${venue.category}, ${venue.googleRating ?? null}, ${venue.totalRatings ?? null},
        ${venue.priceLevel ?? null}, ${venue.photoReference ?? null}, ${venue.photoUrl ?? null},
        ${venue.photoUrls ?? []}, ${now}
      )
      ON CONFLICT (place_id) DO UPDATE SET
        zone_id = EXCLUDED.zone_id,
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        venue_type = EXCLUDED.venue_type,
        category = EXCLUDED.category,
        google_rating = EXCLUDED.google_rating,
        total_ratings = EXCLUDED.total_ratings,
        price_level = EXCLUDED.price_level,
        photo_reference = EXCLUDED.photo_reference,
        photo_url = EXCLUDED.photo_url,
        photo_urls = EXCLUDED.photo_urls,
        updated_at = EXCLUDED.updated_at
    `;
  }

  return NextResponse.json({ status: "success", data: { zones: LAUNCH_ZONES, discovered: venues.length, discoveredByZone } });
}

export const GET = POST;
