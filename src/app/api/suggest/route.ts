import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  suggestVenues,
  type AISuggestExplanationFacts,
  type AISuggestMode,
  type AISuggestResult,
} from "@/lib/aiSuggest";
import { CONSUMER_VENUE_SELECT, mapConsumerVenue } from "@/lib/consumerVenue";
import { LAUNCH_ZONE, LAUNCH_ZONES } from "@/lib/launchZone";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase";
import { inZone } from "@/lib/zone";
import type { APIResponse, ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini" as const;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LAUNCH_ZONE_IDS = LAUNCH_ZONES.map((zone) => zone.id);

type SuggestRequestBody = {
  mode?: unknown;
  intent?: unknown;
  userLat?: unknown;
  userLng?: unknown;
  lat?: unknown;
  lng?: unknown;
  excludeVenueIds?: unknown;
};

type ChatCompletionPayload = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

function jsonResponse<T>(
  body: APIResponse<T>,
  status: number,
  headers: Record<string, string> = {},
): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, { status, headers });
}

function extractOpenAIText(payload: unknown): string | null {
  const candidate = payload as ChatCompletionPayload | null;
  return candidate?.choices?.[0]?.message?.content?.trim() || null;
}

async function callOpenAI(messages: Array<{ role: "system" | "user"; content: string }>, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: maxTokens,
      messages,
    }),
    cache: "no-store",
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OpenAI suggest request failed with HTTP ${res.status}`);

  const text = extractOpenAIText(payload);
  if (!text) throw new Error("OpenAI suggest response did not include text.");
  return text;
}

async function translateIntentWithLLM(intent: string): Promise<unknown> {
  return callOpenAI(
    [
      {
        role: "system",
        content:
          "Translate a nightlife venue request into ONLY strict JSON. Do not mention venues. Schema: {\"max_distance_km\": number|null, \"price_level_max\": 1|2|3|4|null, \"category\": string[], \"busyness_preference\": \"dead\"|\"moderate\"|\"any\", \"requires_live_data\": boolean}. Do not invent vibe or atmosphere filters.",
      },
      { role: "user", content: intent },
    ],
    220,
  );
}

function compactExplanationFacts(facts: AISuggestExplanationFacts): Record<string, string | number> {
  const compact: Record<string, string | number> = {
    name: facts.name,
  };
  if (facts.category) compact.category = facts.category;
  if (facts.distanceKm != null) compact.distance_km = facts.distanceKm;
  if (facts.priceLevel != null) compact.price_level = facts.priceLevel;
  if (facts.rating != null) compact.rating = facts.rating;
  if (facts.busynessBucket && facts.busynessSource) {
    compact.busyness_bucket = facts.busynessBucket;
    compact.busyness_source = facts.busynessSource;
  }
  if (facts.mfRatio != null) {
    compact.male_percent = Math.round(facts.mfRatio * 100);
    compact.female_percent = 100 - Math.round(facts.mfRatio * 100);
    compact.check_in_sample_size = facts.mfSampleSize;
  }
  return compact;
}

async function explainWithLLM(facts: AISuggestExplanationFacts): Promise<string | null> {
  const compact = compactExplanationFacts(facts);
  const text = await callOpenAI(
    [
      {
        role: "system",
        content:
          "Write one short recommendation sentence using ONLY the supplied JSON fields. Do not add vibe, atmosphere, crowd, date, music, or neighborhood claims unless that exact fact appears in the JSON. If busyness fields are absent, do not mention busyness or crowd. Return plain text only.",
      },
      { role: "user", content: JSON.stringify(compact) },
    ],
    120,
  );

  return text.replace(/^["']|["']$/g, "").trim() || null;
}

async function loadSuggestVenues(): Promise<ConsumerVenue[]> {
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select(CONSUMER_VENUE_SELECT)
    .in("zone_id", LAUNCH_ZONE_IDS)
    .eq("hidden", false)
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapConsumerVenue)
    .filter((venue) => inZone(venue.lat, venue.lng));
}

function parseMode(value: unknown): AISuggestMode | null {
  if (value === "surprise" || value === "decide") return value;
  if (value === "help-me-decide" || value === "help_me_decide") return "decide";
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parseExcludeVenueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const generatedAt = new Date().toISOString();
  const requestId = uuidv4();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const rate = checkRateLimit(`suggest:${ip}`, 20, 60_000);
  const headers = rateLimitHeaders(rate);

  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return jsonResponse<never>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many suggest requests." },
        meta: { cached: false, generatedAt, requestId },
      },
      429,
      { ...headers, "Retry-After": String(retrySeconds) },
    );
  }

  let body: SuggestRequestBody;
  try {
    body = (await req.json()) as SuggestRequestBody;
  } catch {
    return jsonResponse<never>(
      {
        status: "error",
        error: { code: "BAD_REQUEST", message: "Request body must be JSON." },
        meta: { cached: false, generatedAt, requestId },
      },
      400,
      headers,
    );
  }

  const mode = parseMode(body.mode);
  if (!mode) {
    return jsonResponse<never>(
      {
        status: "error",
        error: { code: "BAD_MODE", message: "mode must be surprise or decide." },
        meta: { cached: false, generatedAt, requestId },
      },
      400,
      headers,
    );
  }

  try {
    const venues = await loadSuggestVenues();
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    const result = await suggestVenues(
      {
        mode,
        intent: typeof body.intent === "string" ? body.intent : "",
        userLat: parseOptionalNumber(body.userLat ?? body.lat),
        userLng: parseOptionalNumber(body.userLng ?? body.lng),
        excludeVenueIds: parseExcludeVenueIds(body.excludeVenueIds),
      },
      venues,
      hasOpenAIKey
        ? {
            filter: translateIntentWithLLM,
            explain: explainWithLLM,
          }
        : {},
    );

    for (const event of result.blocklistEvents) {
      console.warn("[suggest] explanation fallback", {
        venueId: event.venueId,
        venueName: event.venueName,
        term: event.term,
        reason: event.reason,
      });
    }

    return jsonResponse<AISuggestResult>(
      {
        status: "success",
        data: result,
        meta: {
          cached: false,
          generatedAt,
          requestId,
          zone: LAUNCH_ZONE.id,
          model: hasOpenAIKey ? MODEL : "deterministic-fallback",
        },
      },
      200,
      { ...headers, "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    console.error("[suggest] error:", error instanceof Error ? error.message : String(error));
    return jsonResponse<never>(
      {
        status: "error",
        error: { code: "SUGGEST_UNAVAILABLE", message: "Could not generate suggestions from cached venues." },
        meta: { cached: false, generatedAt, requestId },
      },
      500,
      headers,
    );
  }
}
