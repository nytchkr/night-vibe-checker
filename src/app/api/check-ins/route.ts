// ============================================================
// POST /api/check-ins — submit a consumer crowd report
// GET  /api/check-ins — fetch recent public reports or one venue summary
//
// POST body: { venueId, busyness, crowdFeel, note? }
// Auth: required for POST via Supabase Bearer token
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rateLimit";
import { recomputeVenueSignal } from "@/lib/signals";
import type { APIResponse, CheckInSummary, ConsumerCheckIn, VenueSignal } from "@/types";

const MAX_VENUE_ID_LENGTH = 160;
const DUPLICATE_WINDOW_MINUTES = 10;
const POST_RATE_LIMIT_MAX = 5;
const POST_RATE_LIMIT_WINDOW_MS = 60_000;

const PostBodySchema = z.object({
  venueId: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH),
  busyness: z.enum(["dead", "moderate", "packed"]),
  crowdFeel: z.enum(["mostly_male", "mostly_female", "balanced", "mixed"]),
  note: z.string().trim().max(200).optional(),
});

function missingSupabaseConfigResponse(
  error: unknown,
  meta: { cached: boolean; generatedAt: string; requestId: string }
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  console.error("[check-ins] Supabase configuration error:", error.message);
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta },
    { status: 503 }
  );
}

async function getUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function mapCheckIn(row: Record<string, unknown>): ConsumerCheckIn {
  return {
    id: row.id as string,
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    busyness: row.busyness as ConsumerCheckIn["busyness"],
    crowdFeel: row.crowd_feel as ConsumerCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    createdAt: row.created_at as string,
  };
}

function mapSignal(row: Record<string, unknown> | null | undefined): VenueSignal | undefined {
  if (!row) return undefined;
  return {
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    busyness0To100: (row.busyness_0_100 ?? null) as number | null,
    busynessSource: (row.busyness_source ?? null) as VenueSignal["busynessSource"],
    mfRatio: (row.mf_ratio ?? null) as number | null,
    confidence0To1: Number(row.confidence_0_1 ?? 0),
    sampleSize: Number(row.sample_size ?? 0),
    computedAt: row.computed_at as string,
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

async function resolveVenue(venueIdOrPlaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, hidden")
    .or(`id.eq.${venueIdOrPlaceId},place_id.eq.${venueIdOrPlaceId}`)
    .limit(1)
    .single();

  if (error || !data || data.hidden) return null;
  return data as { id: string; place_id: string; hidden: boolean };
}

async function hasRecentDuplicate(venueId: string, userId: string) {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to report." }, meta },
      { status: 401 }
    );
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(`check-ins:POST:${ip}`, POST_RATE_LIMIT_MAX, POST_RATE_LIMIT_WINDOW_MS);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? POST_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many check-in attempts. Try again in a minute." }, meta },
      { status: 429, headers: { "Retry-After": String(retrySeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
      { status: 400 }
    );
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: parsed.error.errors.map((e) => e.message).join("; ") },
        meta,
      },
      { status: 422 }
    );
  }

  const venue = await resolveVenue(parsed.data.venueId);
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta },
      { status: 404 }
    );
  }

  try {
    if (await hasRecentDuplicate(venue.id, userId)) {
      return NextResponse.json<APIResponse<never>>(
        {
          status: "error",
          error: {
            code: "RATE_LIMITED",
            message: "You already reported this venue recently. Try again in a few minutes.",
          },
          meta,
        },
        { status: 429 }
      );
    }
  } catch (error) {
    console.error("[check-ins POST] duplicate guard failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not validate report freshness." }, meta },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .insert({
      venue_id: venue.id,
      place_id: venue.place_id,
      user_id: userId,
      busyness: parsed.data.busyness,
      crowd_feel: parsed.data.crowdFeel,
      note: parsed.data.note ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[check-ins POST] insert failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save report." }, meta },
      { status: 500 }
    );
  }

  let signal: VenueSignal | undefined;
  try {
    signal = mapSignal((await recomputeVenueSignal(venue.id)) as Record<string, unknown>);
  } catch (error) {
    console.error("[check-ins POST] signal recompute failed:", error);
  }

  return NextResponse.json<APIResponse<{ checkIn: ConsumerCheckIn; signal?: VenueSignal }>>(
    { status: "success", data: { checkIn: mapCheckIn(data as Record<string, unknown>), signal }, meta },
    { status: 201 }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const meta = { cached: true, generatedAt: new Date().toISOString(), requestId };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta);
    if (response) return response;
    throw error;
  }

  const { searchParams } = new URL(req.url);
  const venueIdParam = searchParams.get("venueId")?.trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 50);

  if (!venueIdParam) {
    const { data, error } = await supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[check-ins GET feed] DB error:", error);
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "DB_ERROR", message: "Could not fetch reports." }, meta },
        { status: 500 }
      );
    }

    return NextResponse.json<APIResponse<{ checkIns: ConsumerCheckIn[] }>>({
      status: "success",
      data: { checkIns: ((data ?? []) as Record<string, unknown>[]).map(mapCheckIn) },
      meta,
    });
  }

  const venue = await resolveVenue(venueIdParam);
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta },
      { status: 404 }
    );
  }

  const [{ data: checkIns, error }, { data: signalRow, error: signalError }] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at")
      .eq("venue_id", venue.id)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("venue_signals")
      .select("*")
      .eq("venue_id", venue.id)
      .maybeSingle(),
  ]);

  if (error || signalError) {
    console.error("[check-ins GET venue] DB error:", error ?? signalError);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch venue reports." }, meta },
      { status: 500 }
    );
  }

  const signal = mapSignal(signalRow as Record<string, unknown> | null);
  const summary: CheckInSummary = {
    venueId: venue.id,
    busyness0To100: signal?.busyness0To100 ?? null,
    busynessSource: signal?.busynessSource ?? null,
    mfRatio: signal?.mfRatio ?? null,
    confidence0To1: signal?.confidence0To1 ?? 0,
    sampleSize: signal?.sampleSize ?? 0,
    computedAt: signal?.computedAt ?? null,
  };

  return NextResponse.json<APIResponse<{ checkIns: ConsumerCheckIn[]; summary: CheckInSummary }>>({
    status: "success",
    data: {
      checkIns: ((checkIns ?? []) as Record<string, unknown>[]).map(mapCheckIn),
      summary,
    },
    meta,
  });
}
