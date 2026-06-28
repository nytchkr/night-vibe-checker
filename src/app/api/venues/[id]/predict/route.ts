import { NextRequest, NextResponse } from "next/server";
import { fetchBestTimeDayRawForecast, type BestTimeDayForecast } from "@/lib/besttime";
import { checkRateLimit, rateLimitHeaders } from "@/lib/upstashRateLimit";
import { supabaseAdmin } from "@/lib/supabase";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import type {
  PredictionConfidenceLabel,
  PredictionResponse,
  VibeTrendDirection,
} from "@/types/prediction";

export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini" as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const PREDICT_RATE_LIMIT_MAX = 20;
const PREDICT_RATE_LIMIT_WINDOW_MS = 60_000;
const SYSTEM_PROMPT =
  "You are an AI analyst for a nightlife venue app. You receive REAL data about a venue - BestTime hourly busyness forecasts and user check-in reports. Your job is to summarize patterns and produce honest predictions based ONLY on the data provided. Never invent numbers. If data is missing, say so. Return only valid JSON.";

type VenuePredictionRow = {
  id: string;
  place_id: string | null;
  name: string | null;
  address: string | null;
  category: string | null;
  besttime_venue_id: string | null;
};

type CheckInRow = {
  id?: string;
  busyness: "dead" | "moderate" | "packed" | null;
  crowd_feel: string | null;
  note?: string | null;
  gender?: string | null;
  gender_self_report?: string | null;
  created_at: string;
};

type OpenAIPredictionPayload = Partial<PredictionResponse["data"]["predictions"]> & {
  predictions?: Partial<PredictionResponse["data"]["predictions"]>;
};

const VENUE_SELECT = [
  "id",
  "place_id",
  "name",
  "address",
  "category",
  "besttime_venue_id",
  "hidden",
].join(", ");

function normalizeGender(value: string | null | undefined): "M" | "F" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "m" || normalized === "male" || normalized === "man") return "M";
  if (normalized === "f" || normalized === "female" || normalized === "woman") return "F";
  return null;
}

function confidenceLabel(checkInCount: number, hasBestTimeData: boolean): PredictionConfidenceLabel {
  if (checkInCount < 3 && !hasBestTimeData) return "insufficient";
  if (hasBestTimeData && checkInCount >= 8) return "high";
  if (hasBestTimeData || checkInCount >= 5) return "medium";
  return "low";
}

function basis(checkInCount: number, hasBestTimeData: boolean): string {
  const reports = `${checkInCount} check-in ${checkInCount === 1 ? "report" : "reports"}`;
  return hasBestTimeData ? `BestTime forecast + ${reports}` : reports;
}

function attribution(checkInCount: number, hasBestTimeData: boolean): string {
  const reports = `${checkInCount} check-in ${checkInCount === 1 ? "report" : "reports"}`;
  return hasBestTimeData ? `AI forecast - powered by BestTime + ${reports}` : `AI forecast - based on ${reports}`;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeDirection(value: unknown): VibeTrendDirection {
  return value === "up" || value === "down" || value === "stable" || value === "unknown" ? value : "unknown";
}

function safeMalePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractOpenAIText(payload: unknown): string | null {
  const candidate = payload as { choices?: Array<{ message?: { content?: string } }> } | null;
  return candidate?.choices?.[0]?.message?.content ?? null;
}

function parseOpenAIPredictions(text: string): Partial<PredictionResponse["data"]["predictions"]> {
  const parsed = JSON.parse(stripJsonFence(text)) as OpenAIPredictionPayload;
  return parsed.predictions ?? parsed;
}

function normalizePredictions(
  raw: Partial<PredictionResponse["data"]["predictions"]>,
  checkIns: CheckInRow[],
  hasBestTimeData: boolean,
): PredictionResponse["data"]["predictions"] {
  const checkInCount = checkIns.length;
  const dataBasis = basis(checkInCount, hasBestTimeData);
  const binaryGenderCount = checkIns.filter((row) => normalizeGender(row.gender ?? row.gender_self_report)).length;

  const bestTimeToVisit = hasBestTimeData && raw.bestTimeToVisit
    ? {
        dayOfWeek: safeString(raw.bestTimeToVisit.dayOfWeek) ?? "Unknown",
        hourWindow: safeString(raw.bestTimeToVisit.hourWindow) ?? "Unknown",
        basis: safeString(raw.bestTimeToVisit.basis) ?? dataBasis,
      }
    : null;

  const crowdProfileForecast = checkInCount >= 3 && binaryGenderCount >= 3 && raw.crowdProfileForecast
    ? {
        malePercent: safeMalePercent(raw.crowdProfileForecast.malePercent),
        basis: safeString(raw.crowdProfileForecast.basis) ?? `based on ${binaryGenderCount} check-in reports`,
      }
    : null;

  return {
    bestTimeToVisit,
    peakCrowdWindow: {
      tonight: hasBestTimeData ? safeString(raw.peakCrowdWindow?.tonight) : null,
      thisWeekend: null,
    },
    vibeTrend: {
      direction: safeDirection(raw.vibeTrend?.direction),
      description: safeString(raw.vibeTrend?.description) ?? "Not enough recent check-in pattern data yet.",
    },
    crowdProfileForecast,
  };
}

async function fetchRecentCheckIns(venueId: string): Promise<CheckInRow[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, busyness, crowd_feel, note, gender, gender_self_report, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as CheckInRow[];
}

async function fetchBestTimeForecast(venue: VenuePredictionRow): Promise<BestTimeDayForecast | null> {
  const besttimeVenueId = typeof venue.besttime_venue_id === "string" && venue.besttime_venue_id.trim()
    ? venue.besttime_venue_id.trim()
    : null;
  if (!besttimeVenueId) return null;

  try {
    const forecast = await fetchBestTimeDayRawForecast(besttimeVenueId, venue.name ?? "", venue.address ?? "");
    return forecast.hours.length ? forecast : null;
  } catch {
    return null;
  }
}

function buildClaudeContext(
  venue: VenuePredictionRow,
  forecast: BestTimeDayForecast | null,
  checkIns: CheckInRow[],
) {
  return {
    instructions: {
      responseShape: "Return only the predictions object: bestTimeToVisit, peakCrowdWindow, vibeTrend, crowdProfileForecast.",
      honestyRules: [
        "Use only venue, bestTimeHourlyForecast, and checkInSummaries from this JSON.",
        "Do not invent percentages, busyness scores, check-in counts, dates, or weekend forecast data.",
        "If bestTimeHourlyForecast is empty, set BestTime-dependent fields to null.",
        "If checkInSummaries has fewer than 3 reports, set crowdProfileForecast to null.",
        "Every non-null prediction must include or imply a basis tied to BestTime and/or check-in reports.",
      ],
    },
    venue: {
      id: venue.id,
      name: venue.name,
      category: venue.category,
      googlePlaceId: venue.place_id,
      besttimeVenueId: venue.besttime_venue_id,
    },
    bestTimeHourlyForecast: forecast
      ? {
          dayInt: forecast.dayInt,
          updatedOn: forecast.updatedOn,
          hours: forecast.hours,
        }
      : null,
    checkInSummaries: checkIns.map((row) => ({
      busyness: row.busyness,
      crowdFeel: row.crowd_feel,
      note: row.note ?? null,
      gender: normalizeGender(row.gender ?? row.gender_self_report),
      createdAt: row.created_at,
    })),
  };
}

async function callOpenAI(context: unknown): Promise<Partial<PredictionResponse["data"]["predictions"]>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
    }),
    cache: "no-store",
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OpenAI prediction request failed with HTTP ${res.status}`);

  const text = extractOpenAIText(payload);
  if (!text) throw new Error("OpenAI prediction response did not include text JSON.");
  return parseOpenAIPredictions(text);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const generatedAt = new Date().toISOString();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const rate = await checkRateLimit(`venues-predict:${ip}`, PREDICT_RATE_LIMIT_MAX, PREDICT_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);

  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? PREDICT_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many prediction requests." } },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  const { id: rawId } = await params;
  const lookupId = normalizeVenueLookupId(rawId);

  if (!lookupId) {
    return NextResponse.json(
      { status: "error", error: { code: "MISSING_ID", message: "Venue id is required." } },
      { status: 400, headers },
    );
  }

  const { data, error } = await findVisibleVenueByIdOrPlaceId(lookupId, VENUE_SELECT);
  const venue = data as VenuePredictionRow | null;
  if (error || !venue) {
    return NextResponse.json(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue was not found." } },
      { status: 404, headers },
    );
  }

  try {
    const [forecast, checkIns] = await Promise.all([
      fetchBestTimeForecast(venue),
      fetchRecentCheckIns(venue.id),
    ]);
    const hasBestTimeData = Boolean(forecast?.hours.length);
    const rawPredictions = await callOpenAI(buildClaudeContext(venue, forecast, checkIns));
    const predictions = normalizePredictions(rawPredictions, checkIns, hasBestTimeData);
    const checkInCount = checkIns.length;

    const body: PredictionResponse = {
      status: "success",
      data: {
        venueId: venue.id,
        predictions,
        dataQuality: {
          checkInCount,
          hasBestTimeData,
          confidenceLabel: confidenceLabel(checkInCount, hasBestTimeData),
        },
        attribution: attribution(checkInCount, hasBestTimeData),
        warning: checkInCount < 3 ? "Not enough reports yet" : null,
      },
      meta: {
        venueId: venue.id,
        generatedAt,
        model: MODEL,
      },
    };

    return NextResponse.json(body, { headers: { ...headers, "Cache-Control": "private, no-store" } });
  } catch (err) {
    const isKeyMissing = err instanceof Error && err.message.includes("OPENAI_API_KEY");
    console.error("[predict] error:", err instanceof Error ? err.message : String(err));
    const message = isKeyMissing
      ? "Server prediction configuration is incomplete."
      : "Could not generate venue prediction.";
    const status = isKeyMissing ? 503 : 502;
    return NextResponse.json(
      { status: "error", error: { code: "PREDICTION_UNAVAILABLE", message } },
      { status, headers },
    );
  }
}
