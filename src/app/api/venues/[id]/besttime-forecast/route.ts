import { NextRequest, NextResponse } from "next/server";
import { fetchBestTimeDayRawForecast } from "@/lib/besttime";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

type ForecastResponse = {
  venueId: string;
  besttimeVenueId: string | null;
  hours: Array<{ hour: number; busyness: number }>;
  updatedOn: string | null;
};

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

  const rate = checkRateLimit(`venues-besttime:${ip}`, 30, 60_000);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } }
    );
  }

  const { id: rawId } = await params;
  const id = normalizeVenueLookupId(rawId);
  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 400, headers }
    );
  }

  const { data, error } = await findVisibleVenueByIdOrPlaceId(id, "id, place_id, besttime_venue_id, hidden");

  const venue = data as { id: string; besttime_venue_id: string | null } | null;

  if (error || !venue) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VENUE_NOT_FOUND", message: "Venue was not found in the cached launch-zone database." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 404, headers }
    );
  }

  const besttimeVenueId = typeof venue.besttime_venue_id === "string" && venue.besttime_venue_id.trim()
    ? venue.besttime_venue_id.trim()
    : null;

  if (!besttimeVenueId) {
    return NextResponse.json<APIResponse<ForecastResponse>>(
      {
        status: "success",
        data: { venueId: venue.id, besttimeVenueId: null, hours: [], updatedOn: null },
        meta: { cached: false, generatedAt, requestId },
      },
      { headers }
    );
  }

  try {
    const forecast = await fetchBestTimeDayRawForecast(besttimeVenueId);
    return NextResponse.json<APIResponse<ForecastResponse>>(
      {
        status: "success",
        data: {
          venueId: venue.id,
          besttimeVenueId,
          hours: forecast.hours,
          updatedOn: forecast.updatedOn,
        },
        meta: { cached: false, generatedAt, requestId },
      },
      { headers }
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "BESTTIME_FORECAST_UNAVAILABLE", message: "BestTime forecast unavailable.", details: detail },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 502, headers }
    );
  }
}
