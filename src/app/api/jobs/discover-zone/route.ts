import { NextRequest, NextResponse } from "next/server";
import { LAUNCH_ZONE } from "@/lib/launchZone";
import { discoverZone } from "@/lib/places";
import { supabaseAdmin } from "@/lib/supabase";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const venues = await discoverZone(LAUNCH_ZONE);
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
      updated_at: now,
    })),
    { onConflict: "place_id" }
  );

  if (error) {
    console.error("[discover-zone] upsert failed:", error);
    return NextResponse.json({ status: "error", error: { code: "DB_ERROR" } }, { status: 500 });
  }

  return NextResponse.json({ status: "success", data: { zone: LAUNCH_ZONE, discovered: venues.length } });
}

export const GET = POST;
