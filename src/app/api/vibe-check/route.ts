// ============================================================
// POST /api/vibe-check
//
// Body: {
//   venueId:      string  — Google Places ID
//   venueName:    string  — display name
//   location:     string  — address / city
//   photoBase64?: string  — optional raw base64 image (no data: prefix)
// }
//
// Returns: APIResponse<VibeReport>
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeVibe } from "@/lib/ai";
import { getVenueDetails, getVenueReviews } from "@/lib/places";
import { checkRateLimit, getRemainingRequests } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, VibeReport, VibeInput } from "@/types";

// --------------- Request body schema -----------------------

const RequestSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  venueName: z.string().min(1, "venueName is required"),
  location: z.string().optional().default(""),
  photoBase64: z
    .string()
    .optional()
    // Strip the data: prefix if the client accidentally includes it
    .transform((v) => v?.replace(/^data:image\/[a-z]+;base64,/, "")),
});

// --------------- Route handler -----------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();

  // 1. Rate limiting — key by the first forwarded IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = checkRateLimit(ip);
  const remaining = getRemainingRequests(ip);

  const rateLimitHeaders = {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": String(remaining),
    "X-Request-Id": requestId,
  };

  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Retry in ${retrySeconds}s.`,
        },
        meta: { cached: false, generatedAt: new Date().toISOString(), requestId },
      },
      {
        status: 429,
        headers: { ...rateLimitHeaders, "Retry-After": String(retrySeconds) },
      }
    );
  }

  // 2. Parse + validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." },
        meta: { cached: false, generatedAt: new Date().toISOString(), requestId },
      },
      { status: 400, headers: rateLimitHeaders }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join("; "),
          details: parsed.error.flatten(),
        },
        meta: { cached: false, generatedAt: new Date().toISOString(), requestId },
      },
      { status: 422, headers: rateLimitHeaders }
    );
  }

  const { venueId, venueName, location, photoBase64 } = parsed.data;

  // 3. Fetch venue details + reviews from Google Places
  //    We do both in parallel; reviews are the key AI context.
  //    If Places fails we still proceed with the info from the request body.
  let venueType = "bar";
  let googleRating: number | undefined;
  let priceLevel: number | undefined;
  let reviews: string[] = [];

  try {
    const [detail, reviewTexts] = await Promise.all([
      getVenueDetails(venueId),
      getVenueReviews(venueId),
    ]);
    venueType = detail.type ?? "bar";
    googleRating = detail.googleRating;
    priceLevel = detail.priceLevel;
    reviews = reviewTexts;
  } catch (placesErr) {
    // Non-fatal: AI module handles sparse data gracefully
    console.warn("[vibe-check] Places fetch failed (continuing):", placesErr);
  }

  // 4. Build VibeInput and call AI module
  const input: VibeInput = {
    venueId,
    venueName,
    address: location,
    venueType,
    googleRating,
    priceLevel,
    reviews,
    photoBase64,
  };

  // analyzeVibe never throws — returns fallback on any internal error
  const report: VibeReport = await analyzeVibe(input);

  // 5. Determine if response came from cache
  //    We infer this by checking if generatedAt is older than ~5 seconds
  const isCached =
    Date.now() - new Date(report.generatedAt).getTime() > 5_000;

  return NextResponse.json<APIResponse<VibeReport>>(
    {
      status: "success",
      data: report,
      meta: {
        cached: isCached,
        generatedAt: report.generatedAt,
        requestId,
      },
    },
    { status: 200, headers: rateLimitHeaders }
  );
}
