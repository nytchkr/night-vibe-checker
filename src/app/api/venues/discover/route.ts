// ============================================================
// GET /api/venues/discover
// Triggers Google Places Nearby Search for the South End launch
// zone, upserts results into the venues table, and returns the
// full list of upserted venues.
//
// Protected by x-cron-secret header. Call this from a Vercel
// cron job or manually with:
//   curl -H "x-cron-secret: $CRON_SECRET" \
//        https://nytchkr.com/api/venues/discover
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { LAUNCH_ZONE, LAUNCH_ZONES } from "@/lib/launchZone";
import { inferCanonicalOpenNow } from "@/lib/openNow";
import { discoverZone } from "@/lib/places";
import { sql } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue } from "@/types";
import type { DiscoveredVenue } from "@/lib/places";

export const dynamic = "force-dynamic";

const DYNAMIC_HEADERS = {
  "Cache-Control": "private, no-store",
};

const EDGE_CACHE_HEADERS = {
  "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
};

function mapPhotoUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mapPhotoUrls(row: Record<string, unknown>): string[] | undefined {
  const urls = new Set<string>();
  if (Array.isArray(row.photo_url)) {
    for (const item of row.photo_url) {
      if (typeof item === "string" && item.length > 0) urls.add(item);
    }
  }
  if (Array.isArray(row.photo_urls)) {
    for (const item of row.photo_urls) {
      if (typeof item === "string" && item.length > 0) urls.add(item);
    }
  }
  return urls.size ? Array.from(urls) : undefined;
}

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

  const discoveredByPlaceId = new Map<string, DiscoveredVenue>();
  try {
    for (const zone of LAUNCH_ZONES) {
      const venues = await discoverZone(zone);
      for (const venue of venues.map((item) => ({ ...item, zoneId: zone.id }))) {
        if (!discoveredByPlaceId.has(venue.placeId)) {
          discoveredByPlaceId.set(venue.placeId, venue);
        }
      }
    }
  } catch (err) {
    console.error("[venues/discover] Places API error:", err);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "PLACES_ERROR", message: "Places discovery failed." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 502 }
    );
  }

  const discovered = Array.from(discoveredByPlaceId.values());
  const now = generatedAt;
  for (const venue of discovered) {
    await sql`
      INSERT INTO venues (
        place_id, zone_id, name, address, lat, lng, venue_type, category, google_rating,
        total_ratings, price_level, photo_reference, photo_url, photo_urls, opening_hours, open_now, updated_at
      )
      VALUES (
        ${venue.placeId}, ${venue.zoneId}, ${venue.name}, ${venue.address}, ${venue.lat}, ${venue.lng},
        ${venue.category}, ${venue.category}, ${venue.googleRating ?? null}, ${venue.totalRatings ?? null},
        ${venue.priceLevel ?? null}, ${venue.photoReference ?? null}, ${venue.photoUrl ?? null},
        ${venue.photoUrls ?? []}, ${JSON.stringify(venue.openingHours ?? null)}::jsonb, ${venue.openNow ?? null}, ${now}
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
        opening_hours = EXCLUDED.opening_hours,
        open_now = EXCLUDED.open_now,
        updated_at = EXCLUDED.updated_at
    `;
  }

  // Return the venues we just upserted from the DB to confirm persisted state
  const venueRows = await sql`
    SELECT id, slug, place_id, zone_id, name, address, lat, lng, category, google_rating, total_ratings,
           price_level, photo_reference, photo_url, photo_urls, opening_hours, open_now, updated_at, hidden
    FROM venues
    WHERE zone_id = ANY(${LAUNCH_ZONES.map((zone) => zone.id)}::text[])
      AND COALESCE(hidden, false) = false
    ORDER BY name ASC
    LIMIT 100
  `;

  const venues: ConsumerVenue[] = (venueRows as Record<string, unknown>[]).map((row) => ({
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
    photoUrl: mapPhotoUrl(row.photo_url),
    photoUrls: mapPhotoUrls(row),
    openingHours: Array.isArray(row.opening_hours)
      ? row.opening_hours.filter((item): item is string => typeof item === "string" && item.length > 0)
      : row.opening_hours && typeof row.opening_hours === "object" && !Array.isArray(row.opening_hours) && Array.isArray((row.opening_hours as { weekday_text?: unknown }).weekday_text)
        ? (row.opening_hours as { weekday_text: unknown[] }).weekday_text.filter((item): item is string => typeof item === "string" && item.length > 0)
        : undefined,
    openNow: inferCanonicalOpenNow({
      category: (row.category ?? row.venue_type) as string | null,
      openingHours: row.opening_hours,
      refreshedAt: row.updated_at,
    }),
    hidden: Boolean(row.hidden),
    signal: null,
  }));

  return NextResponse.json<APIResponse<{ zone: typeof LAUNCH_ZONE; venues: ConsumerVenue[]; discovered: number }>>({
    status: "success",
    data: { zone: LAUNCH_ZONE, venues, discovered: discovered.length },
    meta: { cached: false, generatedAt, requestId },
  }, { headers: EDGE_CACHE_HEADERS });
}
