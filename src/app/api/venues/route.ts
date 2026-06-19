// ============================================================
// GET /api/venues?q=<query>&lat=<lat>&lng=<lng>
//
// Searches Google Places for nightlife venues.
// Attaches cached vibe scores from Supabase where available.
//
// When Google Places is unavailable (REQUEST_DENIED, quota, etc.)
// returns a set of hardcoded demo venues so the home feed is
// never empty during a demo. Response includes demo_mode: true
// in the meta object when fallback is active.
//
// Returns: APIResponse<VenueBasic[]>
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchVenues } from "@/lib/places";
import { DEMO_VENUES } from "@/lib/demoVenues";
import { supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, VenueBasic } from "@/types";

// --------------- Query param schema ------------------------

const QuerySchema = z.object({
  q: z.string().min(1, "'q' search term is required"),
  lat: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseFloat(v) : undefined))
    .refine((v) => v === undefined || !isNaN(v), { message: "lat must be a number" }),
  lng: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseFloat(v) : undefined))
    .refine((v) => v === undefined || !isNaN(v), { message: "lng must be a number" }),
});

// --------------- Route handler -----------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();

  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = checkRateLimit(`venues:${ip}`, 30, 60_000); // 30 venue searches/min
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: false, generatedAt: new Date().toISOString(), requestId },
      },
      { status: 429, headers: { "Retry-After": String(retrySeconds) } }
    );
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const rawParams = {
    q: searchParams.get("q") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        meta: { cached: false, generatedAt: new Date().toISOString(), requestId },
      },
      { status: 422 }
    );
  }

  const { q, lat, lng } = parsed.data;

  // Fetch from Places — fall back to demo venues if unavailable
  let venues: VenueBasic[];
  let demoMode = false;

  try {
    venues = await searchVenues(q, lat, lng);
  } catch (err) {
    console.error("[venues] Places search error:", err);
    // Return demo venues rather than an empty list so the feed is usable for demo
    venues = DEMO_VENUES;
    demoMode = true;
  }

  // Hydrate cached vibe scores in a single DB query
  if (venues.length > 0) {
    const placeIds = venues.map((v) => v.placeId);
    const { data: cachedScores } = await supabaseAdmin
      .from("venues")
      .select("place_id, avg_vibe_score")
      .in("place_id", placeIds);

    if (cachedScores) {
      // Build a lookup map for O(1) hydration
      const scoreMap = new Map<string, number>(
        cachedScores
          .filter((r) => r.avg_vibe_score != null)
          .map((r) => [r.place_id, Number(r.avg_vibe_score)])
      );

      venues = venues.map((v) => ({
        ...v,
        cachedVibeScore: scoreMap.get(v.placeId),
      }));
    }
  }

  return NextResponse.json<APIResponse<VenueBasic[]>>(
    {
      status: demoMode ? "partial" : "success",
      data: venues,
      ...(demoMode && {
        error: {
          code: "PLACES_UNAVAILABLE",
          message: "Live venue search unavailable — showing demo venues.",
        },
      }),
      meta: {
        cached: false,
        generatedAt: new Date().toISOString(),
        requestId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(demoMode && ({ demo_mode: true } as any)),
      },
    },
    { status: 200 }
  );
}
