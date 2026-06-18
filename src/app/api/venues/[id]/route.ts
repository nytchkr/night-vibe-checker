// ============================================================
// GET /api/venues/[id]
//
// Returns full VenueDetail from Google Places plus the latest
// cached VibeReport for the venue from Supabase.
//
// Returns: APIResponse<{ venue: VenueDetail; report: VibeReport | null }>
//
// Status codes:
//   200  success (or partial if Places failed but we have DB data)
//   400  missing / empty id param
//   429  rate limited
//   500  both Places and Supabase unavailable
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getVenueDetails, PlacesApiError } from "@/lib/places";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, VenueDetail, VibeReport } from "@/types";

// --------------- Route handler -----------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();

  // Rate limiting — 30 req/min per IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = checkRateLimit(`venues-detail:${ip}`, 30, 60_000);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 429, headers: { "Retry-After": String(retrySeconds) } }
    );
  }

  // Validate id (Next.js 15+ params are a Promise)
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 400 }
    );
  }

  // ---- 1. Fetch VenueDetail from Google Places ----
  let venue: VenueDetail | null = null;
  let placesError: string | null = null;

  try {
    venue = await getVenueDetails(id);
  } catch (err) {
    console.error(`[venues/${id}] Places API error:`, err);
    placesError =
      err instanceof PlacesApiError
        ? err.message
        : "Could not fetch venue details from Google Places.";
  }

  // ---- 2. Query Supabase for the latest cached VibeReport ----
  let report: VibeReport | null = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("vibe_reports")
      .select("*")
      .eq("place_id", id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      // Map snake_case DB columns to camelCase VibeReport shape
      report = {
        id: data.id,
        venueId: data.venue_id,
        venueName: venue?.name ?? "Venue",
        vibeScore: Number(data.vibe_score),
        energyLevel: data.energy_level,
        vibeTags: data.vibe_tags ?? [],
        musicVibe: data.music_vibe,
        crowdType: data.crowd_type,
        bestFor: data.best_for ?? [],
        summary: data.summary,
        generatedAt: data.generated_at,
        fromPhoto: data.from_photo ?? false,
        confidence: Number(data.confidence ?? 1),
      };

      if (venue) {
        venue.cachedVibeScore = report.vibeScore;
      }
    }
  } catch (err) {
    // Non-fatal — log and continue with report = null
    console.error(`[venues/${id}] Supabase query error:`, err);
  }

  // ---- 3. Graceful degradation logic ----

  // Both failed — hard 500
  if (!venue && placesError) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: {
          code: "PLACES_UNAVAILABLE",
          message: placesError,
        },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 500 }
    );
  }

  // Places succeeded — return whatever we have
  const status = placesError ? "partial" : "success";

  return NextResponse.json<APIResponse<{ venue: VenueDetail; report: VibeReport | null }>>(
    {
      status,
      data: {
        // venue is guaranteed non-null here (we returned 500 above if both null)
        venue: venue!,
        report,
      },
      ...(placesError && {
        error: {
          code: "PLACES_PARTIAL",
          message: placesError,
        },
      }),
      meta: { cached: false, generatedAt, requestId },
    },
    { status: 200 }
  );
}
