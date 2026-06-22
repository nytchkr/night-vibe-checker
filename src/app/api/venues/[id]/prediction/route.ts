import { NextRequest, NextResponse } from "next/server";
import {
  buildBestTimePrediction,
  fetchBestTimeDayRawForecast,
  type BestTimeCrowdTrend,
} from "@/lib/besttime";
import {
  getRequestUserId,
  getUserSubscriptionStatus,
  isActiveProSubscription,
} from "@/lib/subscription";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";

export const dynamic = "force-dynamic";

type PredictionSource = "besttime_forecast" | "google_popularity_fallback";

type VenuePrediction = {
  available: true;
  source: PredictionSource;
  peakHour: number;
  peakBusyness: number | null;
  bestArrivalHour: number;
  crowdTrend: BestTimeCrowdTrend;
  confidenceScore: number;
  vibeLabel: string;
  summary: string;
};

type VenuePredictionResponse =
  | {
      venueId: string;
      generatedAt: string;
      available: true;
      source: PredictionSource;
      prediction: VenuePrediction;
    }
  | {
      venueId: string;
      generatedAt: string;
      available: false;
      reason: "No forecast data for this venue";
    };

type VenuePredictionRow = {
  id: string;
  place_id: string | null;
  name: string | null;
  category: string | null;
  rating: number | string | null;
  google_rating: number | string | null;
  total_ratings: number | string | null;
  user_rating_count: number | string | null;
  opening_hours: unknown;
  open_now: boolean | null;
  besttime_venue_id: string | null;
};

const VENUE_SELECT = [
  "id",
  "place_id",
  "name",
  "category",
  "rating",
  "google_rating",
  "total_ratings",
  "user_rating_count",
  "opening_hours",
  "open_now",
  "besttime_venue_id",
  "hidden",
].join(", ");

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasOpeningHours(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function hasGoogleFallbackData(venue: VenuePredictionRow): boolean {
  return (
    readNumber(venue.rating) != null ||
    readNumber(venue.google_rating) != null ||
    readNumber(venue.total_ratings) != null ||
    readNumber(venue.user_rating_count) != null ||
    hasOpeningHours(venue.opening_hours) ||
    typeof venue.open_now === "boolean"
  );
}

function venueLooksLateNight(venue: VenuePredictionRow): boolean {
  const category = venue.category?.toLowerCase() ?? "";
  const text = JSON.stringify(venue.opening_hours ?? "").toLowerCase();
  return (
    category.includes("bar") ||
    category.includes("club") ||
    category.includes("night") ||
    text.includes("am") ||
    text.includes("pm")
  );
}

function googleFallbackPeakHour(venue: VenuePredictionRow): number {
  return venueLooksLateNight(venue) ? 22 : 20;
}

function buildGoogleFallbackPrediction(venue: VenuePredictionRow): VenuePrediction | null {
  if (!hasGoogleFallbackData(venue)) return null;

  const peakHour = googleFallbackPeakHour(venue);
  const ratingCount = readNumber(venue.user_rating_count) ?? readNumber(venue.total_ratings);
  const rating = readNumber(venue.rating) ?? readNumber(venue.google_rating);
  const popularityNote = ratingCount
    ? `${Math.round(ratingCount).toLocaleString("en-US")} Google ratings`
    : rating
      ? `${rating.toFixed(1)} Google rating`
      : "Google venue details";
  const openNote = venue.open_now === true
    ? "currently listed as open"
    : venue.open_now === false
      ? "currently listed as closed"
      : "hours on file";

  return {
    available: true,
    source: "google_popularity_fallback",
    peakHour,
    peakBusyness: null,
    bestArrivalHour: (peakHour + 23) % 24,
    crowdTrend: "stable",
    confidenceScore: 0.5,
    vibeLabel: "Google-Based Estimate",
    summary: `BestTime forecast is unavailable. Using ${popularityNote} and ${openNote}; no live crowd percentage is available.`,
  };
}

function bestTimeSummary(peakHour: number, bestArrivalHour: number, vibeLabel: string): string {
  return `${vibeLabel}. Expected to peak around ${formatHour(peakHour)} based on BestTime hourly forecast. Arrive by ${formatHour(bestArrivalHour)} for a better shot at getting in before the rush.`;
}

function formatHour(hour: number): string {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "pm" : "am";
  const display = normalized % 12 || 12;
  return `${display}${suffix}`;
}

async function buildBestTimeVenuePrediction(besttimeVenueId: string): Promise<VenuePrediction | null> {
  const forecast = await fetchBestTimeDayRawForecast(besttimeVenueId);
  const prediction = buildBestTimePrediction(forecast);
  if (!prediction) return null;

  return {
    available: true,
    source: "besttime_forecast",
    peakHour: prediction.peakHour,
    peakBusyness: prediction.peakBusyness,
    bestArrivalHour: prediction.bestArrivalHour,
    crowdTrend: prediction.crowdTrend,
    confidenceScore: 0.9,
    vibeLabel: prediction.vibeLabel,
    summary: bestTimeSummary(prediction.peakHour, prediction.bestArrivalHour, prediction.vibeLabel),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const subscription = await getUserSubscriptionStatus(userId);
  if (!isActiveProSubscription(subscription)) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const lookupId = normalizeVenueLookupId(rawId);
  if (!lookupId) {
    return NextResponse.json({ error: "venue_id_required" }, { status: 400 });
  }

  const generatedAt = new Date().toISOString();
  const { data, error } = await findVisibleVenueByIdOrPlaceId(lookupId, VENUE_SELECT);
  const venue = data as VenuePredictionRow | null;

  if (error || !venue) {
    return NextResponse.json({ error: "venue_not_found" }, { status: 404 });
  }

  const besttimeVenueId = typeof venue.besttime_venue_id === "string" && venue.besttime_venue_id.trim()
    ? venue.besttime_venue_id.trim()
    : null;

  let prediction: VenuePrediction | null = null;
  if (besttimeVenueId) {
    try {
      prediction = await buildBestTimeVenuePrediction(besttimeVenueId);
    } catch {
      prediction = null;
    }
  }

  prediction ??= buildGoogleFallbackPrediction(venue);

  if (!prediction) {
    const body: VenuePredictionResponse = {
      venueId: venue.id,
      generatedAt,
      available: false,
      reason: "No forecast data for this venue",
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  }

  const body: VenuePredictionResponse = {
    venueId: venue.id,
    generatedAt,
    available: true,
    source: prediction.source,
    prediction,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
