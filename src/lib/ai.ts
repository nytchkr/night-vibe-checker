// ============================================================
// Night Vibe Checker — AI Analysis Module
// SERVER-SIDE ONLY — never import this from a Client Component.
// ============================================================

import OpenAI from "openai";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "./supabase";
import type {
  VibeReport,
  VibeInput,
  EnergyLevel,
  MusicVibe,
  CrowdType,
  BestFor,
  VibeTagValue,
} from "@/types";

// --------------- Guard against accidental client import -----

if (typeof window !== "undefined") {
  throw new Error(
    "[ai.ts] This module is server-side only. Do not import it in Client Components."
  );
}

// --------------- OpenAI singleton ---------------------------

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Exposed for testing — lets test suites inject a mock client
export function setOpenAIClient(client: OpenAI): void {
  _openai = client;
}

// --------------- Cache TTL ----------------------------------

/** 2-hour cache: long enough to avoid redundant API calls, short enough to stay current */
export const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// --------------- Zod schema for AI response -----------------

const VibeReportAISchema = z.object({
  vibeScore: z
    .number()
    .min(0)
    .max(10)
    .transform((n) => Math.round(n * 10) / 10),
  energyLevel: z.enum(["Low", "Medium", "High", "Intense"]),
  vibeTags: z
    .array(z.string())
    .min(3)
    .max(6),
  musicVibe: z.enum([
    "None / Background",
    "Soft / Ambient",
    "Moderate",
    "Loud / Dance",
    "Live Performance",
  ]),
  crowdType: z.enum(["Sparse", "Moderate", "Packed", "Waiting-List Packed"]),
  bestFor: z
    .array(
      z.enum([
        "Date Night",
        "Group Night Out",
        "Solo Exploring",
        "Business Drinks",
        "Late Night",
        "Pre-Gaming",
        "Casual Hangout",
      ])
    )
    .min(1)
    .max(4),
  summary: z.string().min(40).max(400),
  confidence: z.number().min(0).max(1),
});

type VibeReportAI = z.infer<typeof VibeReportAISchema>;

// --------------- System prompt ------------------------------

const SYSTEM_PROMPT = `You are VibeAI, an expert nightlife analyst embedded in the Night Vibe Checker app. Your job is to assess the current vibe of a bar, club, or lounge and return a structured JSON report.

Scoring rubric for vibeScore (0–10):
0–2   Dead / nearly empty, off-putting atmosphere
3–4   Quiet, low energy, or mediocre
5–6   Decent — some activity, acceptable vibe
7–8   Good to great — energetic, welcoming, memorable
9–10  Legendary night out — exceptional energy and atmosphere

Rules:
- vibeTags: choose ONLY from this exact list:
  Lively, Chill, Trendy, Classy, Divey, Intimate, EDM, Hip-Hop, Live Music, Top 40, Jazz, Reggaeton, Young Crowd, Mixed Crowd, Upscale Crowd, LGBTQ+ Friendly, Locals Hangout, Cover Charge, No Cover, Long Lines, Easy Entry, Great Cocktails, Craft Beer, Hidden Gem, Touristy, Good for Dates, Group Friendly, Photogenic
- confidence: lower when data is sparse (few reviews, no photo, generic venue name)
- summary: 2–3 vivid sentences written for someone deciding whether to go tonight
- Respond ONLY with a valid JSON object. No markdown. No explanation.`;

// --------------- Prompt builder ----------------------------

function buildUserPrompt(input: VibeInput): string {
  const reviewBlock =
    input.reviews.length > 0
      ? input.reviews
          .slice(0, 8)
          .map((r, i) => `Review ${i + 1}: "${r}"`)
          .join("\n")
      : "No reviews available.";

  return `Venue: ${input.venueName}
Type: ${input.venueType}
Address: ${input.address}
Google Rating: ${input.googleRating != null ? `${input.googleRating}/5` : "N/A"}
Price Level: ${input.priceLevel ? "$".repeat(input.priceLevel) : "Unknown"}

Recent Reviews:
${reviewBlock}

${input.photoBase64 ? "A photo taken inside the venue has been provided — use it to assess lighting, crowd density, décor, and overall atmosphere." : "No venue photo provided."}

Return ONLY a JSON object matching this exact shape:
{
  "vibeScore": <number 0–10, one decimal>,
  "energyLevel": "Low" | "Medium" | "High" | "Intense",
  "vibeTags": <string[], 3–6 items from the allowed list>,
  "musicVibe": "None / Background" | "Soft / Ambient" | "Moderate" | "Loud / Dance" | "Live Performance",
  "crowdType": "Sparse" | "Moderate" | "Packed" | "Waiting-List Packed",
  "bestFor": <string[], 1–4 items from: Date Night, Group Night Out, Solo Exploring, Business Drinks, Late Night, Pre-Gaming, Casual Hangout>,
  "summary": <string, 2–3 sentences>,
  "confidence": <number 0–1>
}`;
}

// --------------- Fallback report ---------------------------

export function buildFallbackReport(input: VibeInput): VibeReport {
  // Derive a rough score from Google rating if available; otherwise 5.0
  const derivedScore =
    input.googleRating != null
      ? Math.round((input.googleRating / 5) * 10 * 10) / 10
      : 5.0;

  return {
    id: uuidv4(),
    venueId: input.venueId,
    venueName: input.venueName,
    vibeScore: Math.min(derivedScore, 10),
    energyLevel: "Medium",
    vibeTags: ["Mixed Crowd"],
    musicVibe: "Moderate",
    crowdType: "Moderate",
    bestFor: ["Casual Hangout"],
    summary: `${input.venueName} is a ${input.venueType} at ${input.address}. We couldn't complete a full vibe analysis right now — check back after more visitors share their experience.`,
    confidence: 0.05,
    fromPhoto: !!input.photoBase64,
    generatedAt: new Date().toISOString(),
  };
}

// --------------- Cache helpers -----------------------------

/** Returns a recent cached VibeReport, or null if stale / not found. */
export async function getCachedReport(
  venueId: string
): Promise<VibeReport | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("vibe_reports")
    .select("*")
    .eq("place_id", venueId)
    .gte("generated_at", cutoff)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    venueId: data.place_id,
    venueName: "", // caller fills this in from input
    vibeScore: Number(data.vibe_score),
    energyLevel: data.energy_level as EnergyLevel,
    vibeTags: (data.vibe_tags ?? []) as VibeTagValue[],
    musicVibe: data.music_vibe as MusicVibe,
    crowdType: data.crowd_type as CrowdType,
    bestFor: (data.best_for ?? []) as BestFor[],
    summary: data.summary,
    confidence: Number(data.confidence),
    fromPhoto: data.from_photo,
    generatedAt: data.generated_at,
  };
}

/** Upsert the venue row and persist the vibe report to DB. Fire-and-forget. */
async function persistReport(
  report: VibeReport,
  input: VibeInput,
  rawAI: VibeReportAI
): Promise<void> {
  // Upsert venue first to obtain its UUID FK
  const { data: venueRow, error: venueErr } = await supabaseAdmin
    .from("venues")
    .upsert(
      {
        place_id: input.venueId,
        name: input.venueName,
        address: input.address,
        venue_type: input.venueType,
        google_rating: input.googleRating ?? null,
        price_level: input.priceLevel ?? null,
        // lat/lng are required in schema — supply 0 if unavailable; caller should pass them
        lat: 0,
        lng: 0,
      },
      { onConflict: "place_id" }
    )
    .select("id")
    .single();

  if (venueErr || !venueRow) {
    console.error("[VibeAI] venue upsert failed:", venueErr);
    return;
  }

  await supabaseAdmin.from("vibe_reports").insert({
    id: report.id,
    venue_id: venueRow.id,
    place_id: report.venueId,
    vibe_score: report.vibeScore,
    energy_level: report.energyLevel,
    vibe_tags: report.vibeTags,
    music_vibe: report.musicVibe,
    crowd_type: report.crowdType,
    best_for: report.bestFor,
    summary: report.summary,
    confidence: report.confidence,
    from_photo: report.fromPhoto,
    raw_ai_response: rawAI,
    generated_at: report.generatedAt,
  });
}

// --------------- Main exported function --------------------

/**
 * Generate a VibeReport for the given venue.
 *
 * Flow:
 *   1. Cache check (skip for photo uploads — they are always fresh)
 *   2. Build GPT-4o messages (multimodal if photo present)
 *   3. Call OpenAI with json_object response format
 *   4. Validate with Zod — fallback on parse failure
 *   5. Persist to Supabase (fire-and-forget)
 *
 * Never throws — returns a fallback VibeReport on any failure path.
 */
export async function analyzeVibe(input: VibeInput): Promise<VibeReport> {
  // 1. Cache check
  if (!input.photoBase64) {
    try {
      const cached = await getCachedReport(input.venueId);
      if (cached) {
        console.log(`[VibeAI] Cache HIT for ${input.venueId}`);
        return { ...cached, venueName: input.venueName };
      }
    } catch (cacheErr) {
      // Cache read failure is non-fatal — continue to AI call
      console.warn("[VibeAI] Cache read error (continuing):", cacheErr);
    }
  }

  // 2. Build OpenAI messages
  let openai: OpenAI;
  try {
    openai = getOpenAIClient();
  } catch {
    console.error("[VibeAI] OpenAI client unavailable — returning fallback.");
    return buildFallbackReport(input);
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (input.photoBase64) {
    // Multimodal request: text prompt + base64 image
    messages.push({
      role: "user",
      content: [
        { type: "text", text: buildUserPrompt(input) },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${input.photoBase64}`,
            detail: "low", // "low" is cheaper and sufficient for ambiance detection
          },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: buildUserPrompt(input) });
  }

  // 3. Call OpenAI
  let rawText: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 600,
      temperature: 0.35, // consistent structured output
      response_format: { type: "json_object" }, // guarantees valid JSON
    });
    rawText = completion.choices[0]?.message?.content ?? "";
    if (!rawText) throw new Error("Empty content in OpenAI response");
  } catch (apiErr) {
    console.error("[VibeAI] OpenAI API error:", apiErr);
    return buildFallbackReport(input);
  }

  // 4. Parse + Zod validate
  let parsed: VibeReportAI;
  try {
    const json = JSON.parse(rawText);
    parsed = VibeReportAISchema.parse(json);
  } catch (parseErr) {
    console.error("[VibeAI] Zod validation failed:", parseErr, "\nRaw:", rawText);
    return buildFallbackReport(input);
  }

  // 5. Assemble VibeReport
  const report: VibeReport = {
    id: uuidv4(),
    venueId: input.venueId,
    venueName: input.venueName,
    vibeScore: parsed.vibeScore,
    energyLevel: parsed.energyLevel,
    vibeTags: parsed.vibeTags as VibeTagValue[],
    musicVibe: parsed.musicVibe,
    crowdType: parsed.crowdType,
    bestFor: parsed.bestFor as BestFor[],
    summary: parsed.summary,
    confidence: parsed.confidence,
    fromPhoto: !!input.photoBase64,
    generatedAt: new Date().toISOString(),
  };

  // 6. Persist async (never block the HTTP response)
  persistReport(report, input, parsed).catch((e) =>
    console.error("[VibeAI] Background persist failed:", e)
  );

  return report;
}
