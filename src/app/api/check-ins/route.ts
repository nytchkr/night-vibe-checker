// ============================================================
// POST /api/check-ins — submit a consumer crowd report
// GET  /api/check-ins — fetch recent public reports or one venue summary
//
// POST body: { venue_id } or { venueId, busyness, crowdFeel, note?, genderSelfReport? }
// Auth: required for POST via Supabase Bearer token
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { recomputeVenueSignal } from "@/lib/signals";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import type { APIResponse, CheckInSummary, ConsumerCheckIn, VenueSignal } from "@/types";

const MAX_VENUE_ID_LENGTH = 160;
const DUPLICATE_WINDOW_MINUTES = 60;
const POST_RATE_LIMIT_MAX = 10;
const POST_RATE_LIMIT_WINDOW_MS = 60_000;
const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

const BusynessSchema = z.union([
  z.enum(["dead", "moderate", "packed"]),
  z.number().min(0).max(100),
]);

const CrowdFeelSchema = z.enum([
  "chill",
  "hyped",
  "mixed",
  "dead",
  "packed",
  "mostly_male",
  "mostly_female",
  "balanced",
]);

const GenderSelfReportSchema = z.enum(["m", "f", "nb"]);

const PostBodySchema = z.object({
  venue_id: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  place_id: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  venueId: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  busyness: BusynessSchema.optional(),
  crowd_feel: CrowdFeelSchema.optional(),
  crowdFeel: CrowdFeelSchema.optional(),
  note: z.string().trim().max(500, "note must be 500 characters or less.").optional(),
  gender: GenderSelfReportSchema.optional(),
  gender_self_report: GenderSelfReportSchema.nullable().optional(),
  genderSelfReport: GenderSelfReportSchema.nullable().optional(),
}).superRefine((data, ctx) => {
  if (!data.venue_id && !data.place_id && !data.venueId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "venue_id is required.",
      path: ["venue_id"],
    });
  }

  const hasDetailedReportFields = Boolean(
    data.busyness ||
    data.crowd_feel ||
    data.crowdFeel ||
    data.note ||
    data.gender ||
    data.gender_self_report ||
    data.genderSelfReport
  );
  if (!hasDetailedReportFields) return;

  if (!data.busyness) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "busyness is required.",
      path: ["busyness"],
    });
  }
  if (!data.crowd_feel && !data.crowdFeel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "crowd_feel is required.",
      path: ["crowd_feel"],
    });
  }
});

function normalizeBusyness(busyness: z.infer<typeof BusynessSchema>): "dead" | "moderate" | "packed" {
  if (typeof busyness === "string") return busyness;
  if (busyness <= 33) return "dead";
  if (busyness >= 67) return "packed";
  return "moderate";
}

function selectedCrowdFeel(data: z.infer<typeof PostBodySchema>) {
  return data.crowd_feel ?? data.crowdFeel ?? "mixed";
}

function selectedVenueId(data: z.infer<typeof PostBodySchema>): string {
  return data.venue_id ?? data.place_id ?? data.venueId ?? "";
}

function isSimpleCheckIn(data: z.infer<typeof PostBodySchema>): boolean {
  return !data.busyness && !data.crowd_feel && !data.crowdFeel && !data.note && !data.gender && !data.gender_self_report && !data.genderSelfReport;
}

function selectedGenderSelfReport(data: z.infer<typeof PostBodySchema>): "m" | "f" | "nb" | null {
  return data.gender ?? data.gender_self_report ?? data.genderSelfReport ?? null;
}

function normalizeReporterGender(gender: unknown): "male" | "female" | null {
  if (gender === "male" || gender === "female") return gender;
  return null;
}

function isMissingGenderSelfReportColumn(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message?.toLowerCase() ?? "";
  return (
    candidate?.code === "42703" ||
    candidate?.code === "PGRST204" ||
    (message.includes("gender_self_report") && message.includes("column"))
  );
}

async function ensureGenderSelfReportColumn(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ensure_check_ins_gender_self_report_column");
  if (error) throw error;
}

function missingSupabaseConfigResponse(
  error: unknown,
  meta: { cached: boolean; generatedAt: string; requestId: string },
  headers?: HeadersInit
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  console.error("[check-ins] Supabase configuration error:", error.message);
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." }, meta },
    { status: 503, headers }
  );
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
    updatedAt: (row.updated_at ?? null) as string | null,
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

async function resolveVenue(venueIdOrPlaceId: string) {
  const { data, error } = await findVisibleVenueByIdOrPlaceId(venueIdOrPlaceId, "id, place_id, hidden");

  if (error || !data || data.hidden) return null;
  return data as { id: string; place_id: string; hidden: boolean };
}

async function getRecentDuplicate(venueId: string, userId: string): Promise<{ id: string; created_at: string } | null> {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, created_at")
    .eq("venue_id", venueId)
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as { id: string; created_at: string } | undefined) ?? null;
}

function retryAfterSeconds(createdAt: string): number {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return DUPLICATE_WINDOW_MINUTES * 60;
  const retryMs = DUPLICATE_WINDOW_MINUTES * 60_000 - (Date.now() - createdMs);
  return Math.max(1, Math.ceil(retryMs / 1000));
}

async function getReporterGender(userId: string): Promise<"male" | "female" | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("gender")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[check-ins POST] profile gender lookup failed:", error);
    return null;
  }

  return normalizeReporterGender(data?.gender);
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

  const ip = getClientIp(req);
  const rate = checkRateLimit(`check-ins:POST:${ip}`, POST_RATE_LIMIT_MAX, POST_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? POST_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many check-in attempts. Try again in a minute." }, meta },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } }
    );
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to report." }, meta },
      { status: 401, headers }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
      { status: 400, headers }
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
      { status: 400, headers }
    );
  }

  const venue = await resolveVenue(normalizeVenueLookupId(selectedVenueId(parsed.data)));
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta },
      { status: 404, headers }
    );
  }

  try {
    const duplicate = await getRecentDuplicate(venue.id, userId);
    if (duplicate) {
      return NextResponse.json<APIResponse<never>>(
        {
          status: "error",
          error: {
            code: "RATE_LIMITED",
            message: "You already checked in at this venue. Try again in an hour.",
          },
          meta,
        },
        { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds(duplicate.created_at)) } }
      );
    }
  } catch (error) {
    console.error("[check-ins POST] duplicate guard failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not validate report freshness." }, meta },
      { status: 500, headers }
    );
  }

  if (isSimpleCheckIn(parsed.data)) {
    const { data, error } = await supabaseAdmin
      .from("check_ins")
      .insert({
        venue_id: venue.id,
        place_id: venue.place_id,
        user_id: userId,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[check-ins POST] simple insert failed:", error);
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "DB_ERROR", message: "Could not save check-in." }, meta },
        { status: 500, headers }
      );
    }

    return NextResponse.json({ success: true, id: (data as { id: string }).id }, { status: 200, headers });
  }

  const reporterGender = await getReporterGender(userId);

  const insertPayload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    user_id: userId,
    busyness: normalizeBusyness(parsed.data.busyness as z.infer<typeof BusynessSchema>),
    crowd_feel: selectedCrowdFeel(parsed.data),
    reporter_gender: reporterGender,
    gender_self_report: selectedGenderSelfReport(parsed.data),
    note: parsed.data.note ?? null,
  };

  const insertResult = await supabaseAdmin
    .from("check_ins")
    .insert(insertPayload)
    .select()
    .single();
  let data = insertResult.data;
  let error: unknown = insertResult.error;

  if (error && isMissingGenderSelfReportColumn(error)) {
    try {
      await ensureGenderSelfReportColumn();
      const retry = await supabaseAdmin
        .from("check_ins")
        .insert(insertPayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    } catch (ensureError) {
      error = ensureError;
    }
  }

  if (error || !data) {
    console.error("[check-ins POST] insert failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save report." }, meta },
      { status: 500, headers }
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
    { status: 200, headers }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const meta = { cached: true, generatedAt: new Date().toISOString(), requestId };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta, PRIVATE_GET_CACHE_HEADERS);
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
        { status: 500, headers: PRIVATE_GET_CACHE_HEADERS }
      );
    }

    return NextResponse.json<APIResponse<{ checkIns: ConsumerCheckIn[] }>>({
      status: "success",
      data: { checkIns: ((data ?? []) as Record<string, unknown>[]).map(mapCheckIn) },
      meta,
    }, { headers: PRIVATE_GET_CACHE_HEADERS });
  }

  const venue = await resolveVenue(venueIdParam);
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta },
      { status: 404, headers: PRIVATE_GET_CACHE_HEADERS }
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
      { status: 500, headers: PRIVATE_GET_CACHE_HEADERS }
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
  }, { headers: PRIVATE_GET_CACHE_HEADERS });
}
