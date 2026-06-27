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

  let { data, error } = await supabaseAdmin
    .from("venue_tips")
    .select("id, venue_id, user_id, tip_text, helpful_count, created_at")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(TIP_LIMIT);

  if (error) {
    const msg = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
    if (msg.includes("tip_text") || msg.includes("column")) {
      const fallback = await supabaseAdmin
        .from("venue_tips")
        .select("id, venue_id, user_id, tip, helpful_count, created_at")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false })
        .limit(TIP_LIMIT);
      data = (fallback.data ?? []).map((r) => ({ ...r, tip_text: r.tip ?? "" })) as typeof data;
      error = fallback.error;
    }
    if (error) {
      console.error("[venue-tips GET] DB error:", error);
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "DB_ERROR", message: "Could not fetch venue tips." }, meta: responseMeta },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    ((data ?? []) as Record<string, unknown>[])
      .map(mapTip)
      .filter((tip) => tip.tip_text.length > 0)
      .slice(0, TIP_LIMIT),
  );
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
