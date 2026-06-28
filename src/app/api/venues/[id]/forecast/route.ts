import { NextResponse } from "next/server";
import { fetchBestTimeDayRawForecast, type BestTimeHourlyForecast } from "@/lib/besttime";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";

export const dynamic = "force-dynamic";

type ForecastRouteResponse = {
  hours: BestTimeHourlyForecast[];
};

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200",
};

function emptyForecast(status = 200): NextResponse<ForecastRouteResponse> {
  return NextResponse.json({ hours: [] }, { status, headers: CACHE_HEADERS });
}

function fullDayForecast(hours: BestTimeHourlyForecast[]): BestTimeHourlyForecast[] {
  const byHour = new Map(
    hours
      .filter((item) => Number.isInteger(item.hour) && item.hour >= 0 && item.hour <= 23)
      .map((item) => [item.hour, Math.max(0, Math.min(100, Math.round(item.busyness)))])
  );

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    busyness: byHour.get(hour) ?? 0,
  }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ForecastRouteResponse>> {
  const { id: rawId } = await params;
  const id = normalizeVenueLookupId(rawId);
  if (!id) return emptyForecast(400);

  const { data, error } = await findVisibleVenueByIdOrPlaceId(
    id,
    "id, place_id, name, address, besttime_venue_id, hidden"
  );
  const venue = data as { id: string; name: string; address: string; besttime_venue_id: string | null } | null;

  if (error || !venue) return emptyForecast(404);

  const besttimeVenueId = typeof venue.besttime_venue_id === "string" && venue.besttime_venue_id.trim()
    ? venue.besttime_venue_id.trim()
    : null;
  if (!besttimeVenueId) return emptyForecast();

  try {
    const forecast = await fetchBestTimeDayRawForecast(besttimeVenueId, venue.name, venue.address);
    return NextResponse.json(
      { hours: fullDayForecast(forecast.hours) },
      { headers: CACHE_HEADERS }
    );
  } catch {
    return emptyForecast();
  }
}
