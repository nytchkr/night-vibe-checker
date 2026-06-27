// ============================================================
// GET/POST /api/venues/[id]/tips
// Public venue tips feed plus authenticated tip creation.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { getClientIp } from "@/lib/apiSecurity";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import type { APIResponse } from "@/types";

const TIP_LIMIT = 5;
const CHECK_IN_LIMIT = 20;
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const AI_TIPS_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=86400";
const TIP_POST_RATE_LIMIT_MAX = 5;
const TIP_POST_RATE_LIMIT_WINDOW_MS = 60_000;
const TipBodySchema = z.object({
  tip_text: z.string().trim().max(200).optional(),
  tip: z.string().trim().max(200).optional(),
}).transform((body) => ({ tip_text: body.tip_text ?? body.tip ?? "" })).pipe(z.object({
  tip_text: z.string().trim().min(1).max(200),
}));

const RawVenueTipSchema = z.object({
  id: z.string(),
  tip_text: z.string(),
  created_at: z.string(),
  helpful_count: z.number().int().nonnegative(),
  author_initials: z.string(),
});

export type VenueTip = {
  id: string;
  tip_text: string;
  created_at: string;
  helpful_count: number;
  author_initials: string;
};

type VenueTipCheckIn = {
  busyness: "dead" | "moderate" | "packed" | string | null;
  created_at: string | null;
};

type VenueTipVenue = {
  id: string;
  name: string;
  category: string | null;
};

function meta(requestId: string, cached = false) {
  return { cached, generatedAt: new Date().toISOString(), requestId };
}

function missingSupabaseConfigResponse(
  error: unknown,
  responseMeta: { cached: boolean; generatedAt: string; requestId: string },
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." }, meta: responseMeta },
    { status: 503 },
  );
}

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function resolveVenueId(venueIdOrPlaceId: string): Promise<string | null> {
  const { data, error } = await findVisibleVenueByIdOrPlaceId(venueIdOrPlaceId, "id, hidden");

  if (error || !data || data.hidden) return null;
  return data.id as string;
}

function authorInitials(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "NV";

  const base = raw.includes("@") ? raw.split("@")[0] : raw;
  const initials = base
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "NV";
}

function mapTip(row: Record<string, unknown>): VenueTip {
  return RawVenueTipSchema.parse({
    id: row.id as string,
    tip_text: String(row.tip_text ?? row.tip ?? "").trim(),
    created_at: row.created_at as string,
    helpful_count: Number(row.helpful_count ?? 0),
    author_initials: authorInitials(row.user_id),
  });
}

function emptyAiTipsResponse(): NextResponse<{ tips: string[] }> {
  return NextResponse.json({ tips: [] }, { headers: { "Cache-Control": AI_TIPS_CACHE_CONTROL } });
}

function hourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized === 0) return "12am";
  if (normalized < 12) return `${normalized}am`;
  if (normalized === 12) return "12pm";
  return `${normalized - 12}pm`;
}

function summarizeCheckIns(checkIns: VenueTipCheckIn[]): string {
  const busynessCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();

  for (const checkIn of checkIns) {
    const busyness = typeof checkIn.busyness === "string" ? checkIn.busyness : "";
    if (busyness) busynessCounts.set(busyness, (busynessCounts.get(busyness) ?? 0) + 1);

    const date = new Date(checkIn.created_at ?? "");
    if (!Number.isNaN(date.getTime())) {
      const hour = date.getUTCHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
  }

  const typicalBusyness =
    [...busynessCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const peakHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hourLabel(hour));

  return `${checkIns.length} recent check-ins. Typical busyness: ${typicalBusyness}. ${
    peakHours.length ? `Most check-ins cluster around ${peakHours.join(", ")}.` : "No clear peak hour yet."
  } Busyness counts: ${
    [...busynessCounts.entries()].map(([label, count]) => `${label} ${count}`).join(", ") || "none"
  }.`;
}

function splitTips(text: string): string[] {
  return text
    .split(/\n+|(?<=\.)\s+(?=\d+\.|\-|\*)/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function extractAnthropicText(payload: unknown): string {
  const content = (payload as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
    })
    .join("\n")
    .trim();
}

async function fetchRecentCheckIns(venueId: string): Promise<VenueTipCheckIn[]> {
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("busyness, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(CHECK_IN_LIMIT);

  if (error || !data) return [];
  return data as VenueTipCheckIn[];
}

async function generateAiVenueTips(venue: VenueTipVenue, checkIns: VenueTipCheckIn[]): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || checkIns.length === 0) return [];

  const summary = summarizeCheckIns(checkIns);
  const category = venue.category?.trim() || "venue";
  const prompt = `Based on these check-in patterns for ${venue.name} (a ${category} in Charlotte NC): ${summary}. Write 2-3 short insider tips for visitors. Be specific and honest. Max 60 words total.`;

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 140,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });

  if (!res.ok) return [];
  const payload: unknown = await res.json().catch(() => null);
  return splitTips(extractAnthropicText(payload));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) return emptyAiTipsResponse();
    throw error;
  }

  const { id: rawId } = await params;
  const requestedVenueId = normalizeVenueLookupId(rawId);
  if (!requestedVenueId) {
    return emptyAiTipsResponse();
  }

  const { data, error } = await findVisibleVenueByIdOrPlaceId(requestedVenueId, "id, name, category, hidden");
  const venue = data as VenueTipVenue | null;
  if (error || !venue) {
    return emptyAiTipsResponse();
  }

  const checkIns = await fetchRecentCheckIns(venue.id);
  const tips = await generateAiVenueTips(venue, checkIns).catch(() => []);

  return NextResponse.json({ tips }, { headers: { "Cache-Control": AI_TIPS_CACHE_CONTROL } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = uuidv4();
  const responseMeta = meta(requestId);

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, responseMeta);
    if (response) return response;
    throw error;
  }

  const rate = checkRateLimit(`venue-tips:POST:${getClientIp(req)}`, TIP_POST_RATE_LIMIT_MAX, TIP_POST_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? TIP_POST_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many tips. Try again shortly." }, meta: responseMeta },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to share a tip." }, meta: responseMeta },
      { status: 401 },
    );
  }

  const { id: rawId } = await params;
  const requestedVenueId = normalizeVenueLookupId(rawId);
  if (!requestedVenueId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "MISSING_ID", message: "Venue id is required." }, meta: responseMeta },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta: responseMeta },
      { status: 400 },
    );
  }

  const parsed = TipBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Tip must be 200 characters or less." }, meta: responseMeta },
      { status: 400 },
    );
  }

  const venueId = await resolveVenueId(requestedVenueId);
  if (!venueId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta: responseMeta },
      { status: 404 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("venue_tips")
    .insert({ venue_id: venueId, user_id: userId, tip_text: parsed.data.tip_text, tip: parsed.data.tip_text })
    .select("id, venue_id, user_id, tip_text, helpful_count, created_at")
    .single();

  if (error || !data) {
    console.error("[venue-tips POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue tip." }, meta: responseMeta },
      { status: 500 },
    );
  }

  return NextResponse.json(mapTip(data as Record<string, unknown>), { status: 201, headers });
}
