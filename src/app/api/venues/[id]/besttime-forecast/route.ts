import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { fetchBestTimeDayRawForecast, fetchBestTimeWeekRawForecast } from "@/lib/besttime";
import { isProUser } from "@/lib/isPro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/upstashRateLimit";
import { redis } from "@/lib/upstashRedis";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

type ForecastResponse = {
  venueId: string;
  besttimeVenueId: string | null;
  hours: Array<{ hour: number; busyness: number }>;
  updatedOn: string | null;
  days?: Array<{
    dayInt: number | null;
    hours: Array<{ hour: number; busyness: number }>;
    updatedOn: string | null;
  }>;
};

const FORECAST_REDIS_TTL_SECONDS = 3600;

function currentDayOfWeek(): number {
  return new Date().getDay();
}

function normalizeCachedForecast(value: unknown): ForecastResponse | null {
  const candidate = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!candidate || typeof candidate !== "object") return null;

  const forecast = candidate as ForecastResponse;
  if (typeof forecast.venueId !== "string") return null;
  if (typeof forecast.besttimeVenueId !== "string" && forecast.besttimeVenueId !== null) return null;
  if (!Array.isArray(forecast.hours)) return null;
  if (!forecast.hours.every((hour) => typeof hour?.hour === "number" && typeof hour?.busyness === "number")) return null;
  if (typeof forecast.updatedOn !== "string" && forecast.updatedOn !== null) return null;
  if (forecast.days !== undefined) {
    if (!Array.isArray(forecast.days)) return null;
    if (!forecast.days.every((day) => (
      (typeof day?.dayInt === "number" || day?.dayInt === null) &&
      Array.isArray(day?.hours) &&
      day.hours.every((hour) => typeof hour?.hour === "number" && typeof hour?.busyness === "number") &&
      (typeof day?.updatedOn === "string" || day?.updatedOn === null)
    ))) return null;
  }

  return forecast;
}

async function getCachedForecast(cacheKey: string): Promise<ForecastResponse | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get(cacheKey);
    if (!cached) return null;
    return normalizeCachedForecast(cached);
  } catch (error) {
    console.error("[besttime-forecast] Redis get failed:", error);
    return null;
  }
}

async function setCachedForecast(cacheKey: string, forecast: ForecastResponse): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cacheKey, forecast, { ex: FORECAST_REDIS_TTL_SECONDS });
  } catch (error) {
    console.error("[besttime-forecast] Redis set failed:", error);
  }
}

async function requestIsPro(req: NextRequest): Promise<boolean> {
  const userId = await getAuthenticatedUserId(req);
  return userId ? isProUser(userId) : false;
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

  const rate = await checkRateLimit(`venues-besttime:${ip}`, 30, 60_000);
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

  const { data, error } = await findVisibleVenueByIdOrPlaceId(id, "id, place_id, name, address, besttime_venue_id, hidden");

  const venue = data as { id: string; name: string; address: string; besttime_venue_id: string | null } | null;

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
  const hasProAccess = await requestIsPro(req);

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

  const dayOfWeek = currentDayOfWeek();
  const cacheKey = `nv:forecast:${venue.id}:${hasProAccess ? "week" : "day"}:${dayOfWeek}`;
  const cachedForecast = await getCachedForecast(cacheKey);
  if (cachedForecast) {
    return NextResponse.json<APIResponse<ForecastResponse>>(
      {
        status: "success",
        data: cachedForecast,
        meta: { cached: true, generatedAt, requestId },
      },
      { headers }
    );
  }

  try {
    const forecast = hasProAccess
      ? await fetchBestTimeWeekRawForecast(besttimeVenueId, venue.name, venue.address)
      : await fetchBestTimeDayRawForecast(besttimeVenueId, venue.name, venue.address);
    const todayForecast = "days" in forecast
      ? forecast.days.find((day) => day.dayInt === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)) ?? forecast.days[0]
      : forecast;
    const data = {
      venueId: venue.id,
      besttimeVenueId,
      hours: todayForecast?.hours ?? [],
      updatedOn: forecast.updatedOn,
      ...(hasProAccess && "days" in forecast
        ? {
            days: forecast.days.map((day) => ({
              dayInt: day.dayInt,
              hours: day.hours,
              updatedOn: day.updatedOn,
            })),
          }
        : {}),
    };
    await setCachedForecast(cacheKey, data);

    return NextResponse.json<APIResponse<ForecastResponse>>(
      {
        status: "success",
        data,
        meta: { cached: false, generatedAt, requestId },
      },
      { headers }
    );
  } catch {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "BESTTIME_FORECAST_UNAVAILABLE", message: "BestTime forecast unavailable." },
        meta: { cached: false, generatedAt, requestId },
      },
      { status: 502, headers }
    );
  }
}
