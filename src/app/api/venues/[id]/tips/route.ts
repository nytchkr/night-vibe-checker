// ============================================================
// GET/POST /api/venues/[id]/tips
// Public recent crowd-note feed plus authenticated legacy tip creation.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { getClientIp } from "@/lib/apiSecurity";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import type { APIResponse } from "@/types";

const TIP_LIMIT = 3;
const TIP_POST_RATE_LIMIT_MAX = 5;
const TIP_POST_RATE_LIMIT_WINDOW_MS = 60_000;
const TipBodySchema = z.object({
  tip: z.string().trim().min(10).max(200),
});

export type VenueTip = {
  id: string;
  venueId: string;
  userId: string | null;
  tip: string;
  helpfulCount: number;
  createdAt: string;
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

function mapTip(row: Record<string, unknown>): VenueTip {
  return {
    id: row.id as string,
    venueId: row.venue_id as string,
    userId: (row.user_id ?? null) as string | null,
    tip: String(row.note ?? row.tip ?? "").trim(),
    helpfulCount: Number(row.helpful_count ?? 0),
    createdAt: row.created_at as string,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = uuidv4();
  const responseMeta = meta(requestId, true);

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, responseMeta);
    if (response) return response;
    throw error;
  }

  const { id: rawId } = await params;
  const requestedVenueId = normalizeVenueLookupId(rawId);
  if (!requestedVenueId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "MISSING_ID", message: "Venue id is required." }, meta: responseMeta },
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
    .from("check_ins")
    .select("id, venue_id, user_id, note, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .not("note", "is", null)
    .neq("note", "")
    .order("created_at", { ascending: false })
    .limit(TIP_LIMIT);

  if (error) {
    console.error("[venue-tips GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch venue tips." }, meta: responseMeta },
      { status: 500 },
    );
  }

  return NextResponse.json<APIResponse<{ tips: VenueTip[] }>>({
    status: "success",
    data: {
      tips: ((data ?? []) as Record<string, unknown>[])
        .map(mapTip)
        .filter((tip) => tip.tip.length > 0)
        .slice(0, TIP_LIMIT),
    },
    meta: responseMeta,
  });
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
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Tip must be 10 to 200 characters." }, meta: responseMeta },
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
    .insert({ venue_id: venueId, user_id: userId, tip: parsed.data.tip })
    .select("id, venue_id, user_id, tip, helpful_count, created_at")
    .single();

  if (error || !data) {
    console.error("[venue-tips POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue tip." }, meta: responseMeta },
      { status: 500 },
    );
  }

  return NextResponse.json<APIResponse<{ tip: VenueTip }>>(
    { status: "success", data: { tip: mapTip(data as Record<string, unknown>) }, meta: responseMeta },
    { status: 201, headers },
  );
}
