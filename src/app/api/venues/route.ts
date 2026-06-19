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
import type { APIResponse } from "@/types";

type CachedVenue = {
  id: string;
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  googleRating?: number;
  totalRatings?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  photoReference?: string;
  photoUrl?: string;
  hidden: boolean;
};

function mapVenue(row: Record<string, unknown>): CachedVenue {
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
    priceLevel: row.price_level == null ? undefined : (Number(row.price_level) as CachedVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: (row.photo_url ?? undefined) as string | undefined,
    hidden: Boolean(row.hidden),
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
      google_rating, total_ratings, price_level, photo_reference, photo_url, hidden
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

  const venues = ((data ?? []) as Record<string, unknown>[]).map(mapVenue);
  return NextResponse.json<APIResponse<{ zone: typeof LAUNCH_ZONE; venues: CachedVenue[] }>>({
    status: "success",
    data: { zone: LAUNCH_ZONE, venues },
    meta: { cached: true, generatedAt, requestId },
  });
}
