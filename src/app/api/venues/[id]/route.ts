// ============================================================
// GET /api/venues/[id]
// Cached venue detail. No external calls.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
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

  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(`
      id, place_id, zone_id, name, address, lat, lng, venue_type, category,
      google_rating, total_ratings, price_level, photo_reference, photo_url, hidden
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
      { status: 404 }
    );
  }

  return NextResponse.json<APIResponse<{ venue: CachedVenue }>>({
    status: "success",
    data: { venue: mapVenue(data as Record<string, unknown>) },
    meta: { cached: true, generatedAt, requestId },
  });
}
