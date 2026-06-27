// ============================================================
// GET /api/venues/trending
// Top visible launch-zone venues by weighted busyness, recent check-ins,
// and open-now state.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { getTrendingVenues } from "@/lib/trendingVenueIds";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

const EDGE_CACHE_HEADERS = {
  "Cache-Control": "s-maxage=120, stale-while-revalidate=600",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const rate = checkRateLimit(`venues:trending:${getClientIp(req)}`, 60, 60_000);
  const headers = rateLimitHeaders(rate);

  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  let venues: ConsumerVenue[];
  try {
    venues = await getTrendingVenues();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load trending venues." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 500, headers: { ...headers, ...NO_STORE_HEADERS } },
    );
  }

  return NextResponse.json<APIResponse<{ venues: ConsumerVenue[] }>>(
    {
      status: "success",
      data: { venues },
      meta: { cached: false, generatedAt, requestId },
    },
    { headers: { ...headers, ...EDGE_CACHE_HEADERS } },
  );
}
