// ============================================================
// POST /api/check-ins — submit a consumer crowd report
// GET  /api/check-ins — fetch recent public reports or one venue summary
//
// POST body: { venue_id } or { venueId, busyness, crowdFeel, note?, gender? }
// Auth: required for POST via Supabase Bearer token
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit";
import {
  checkFirstReportOfNight,
  checkStreakBonus,
  getUserScore,
  refreshStreakCount,
  updateUserScore,
} from "@/lib/rewards";
import { sanitizeText } from "@/lib/sanitize";
import { recomputeVenueSignal } from "@/lib/signals";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import type { APIResponse, CheckInSummary, ConsumerCheckIn, VenueSignal } from "@/types";

// Uses service role — bypasses RLS intentionally for server-side validation and writes.
const MAX_VENUE_ID_LENGTH = 200;
const DUPLICATE_WINDOW_MINUTES = 60;
const POST_RATE_LIMIT_MAX = 10;
const POST_RATE_LIMIT_WINDOW_MS = 60_000;
const USER_POST_RATE_LIMIT_MAX = 10;
const USER_POST_RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const WRITE_ID_ALLOWLIST = /[^a-zA-Z0-9_-]/g;
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
const AllowedVibeValues = new Set([
  "dead",
  "moderate",
  "packed",
  "chill",
  "hyped",
  "mixed",
  "mostly_male",
  "mostly_female",
  "balanced",
]);

const GenderSchema = z.enum(["M", "F", "prefer_not", "m", "f", "nb", "man", "woman"]);
const GenderSelfReportSchema = z.enum(["m", "f", "nb"]);

const PostBodySchema = z.object({
  venue_id: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  place_id: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  venueId: z.string().trim().min(1).max(MAX_VENUE_ID_LENGTH).optional(),
  busyness: BusynessSchema.optional(),
  crowd_feel: CrowdFeelSchema.optional(),
  crowdFeel: CrowdFeelSchema.optional(),
  note: z.string().trim().max(500, "note must be 500 characters or less.").optional(),
  gender: GenderSchema.optional(),
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

function sanitizeWriteId(value: string): string {
  return value.trim().replace(WRITE_ID_ALLOWLIST, "");
}

function isSimpleCheckIn(data: z.infer<typeof PostBodySchema>): boolean {
  return !data.busyness && !data.crowd_feel && !data.crowdFeel && !data.note && !data.gender && !data.gender_self_report && !data.genderSelfReport;
}

function genderToSelfReport(gender: z.infer<typeof GenderSchema> | null | undefined): "m" | "f" | "nb" | null {
  if (gender === "m" || gender === "f" || gender === "nb") return gender;
  if (gender === "M") return "m";
  if (gender === "F") return "f";
  if (gender === "man") return "m";
  if (gender === "woman") return "f";
  return null;
}

function genderToCanonical(gender: z.infer<typeof GenderSchema> | "m" | "f" | "nb" | null | undefined): "M" | "F" | "prefer_not" {
  if (gender === "M" || gender === "m" || gender === "man") return "M";
  if (gender === "F" || gender === "f" || gender === "woman") return "F";
  return "prefer_not";
}

function selectedGenderSelfReport(data: z.infer<typeof PostBodySchema>): "m" | "f" | "nb" | null {
  if ("gender" in data) return genderToSelfReport(data.gender);
  return data.gender_self_report ?? data.genderSelfReport ?? null;
}

function selectedGender(data: z.infer<typeof PostBodySchema>): "M" | "F" | "prefer_not" {
  return genderToCanonical(data.gender ?? data.gender_self_report ?? data.genderSelfReport ?? null);
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

function isMissingGenderColumn(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message?.toLowerCase() ?? "";
  return (
    candidate?.code === "42703" ||
    candidate?.code === "PGRST204" ||
    (message.includes("gender") && message.includes("column"))
  );
}

async function ensureGenderSelfReportColumn(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ensure_check_ins_gender_self_report_column");
  if (error) throw error;
}

async function ensureGenderColumn(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ensure_check_ins_gender_column");
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

function duplicateRetryAfterSeconds(createdAt: string): number {
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
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many check-in attempts. Try again in a minute." }, meta },
      { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds(rate, POST_RATE_LIMIT_WINDOW_MS)) } }
    );
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to report." }, meta },
      { status: 401, headers }
    );
  }

  const userRate = checkRateLimit(
    `check-ins:POST:user:${userId}`,
    USER_POST_RATE_LIMIT_MAX,
    USER_POST_RATE_LIMIT_WINDOW_MS
  );
  const userHeaders = rateLimitHeaders(userRate);
  if (!userRate.allowed) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many check-ins. Try again later." }, meta },
      { status: 429, headers: { ...userHeaders, "Retry-After": String(retryAfterSeconds(userRate, USER_POST_RATE_LIMIT_WINDOW_MS)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
      { status: 400, headers: userHeaders }
    );
  }

  const candidate = body as Record<string, unknown>;
  const rawVenueId = candidate.venue_id ?? candidate.place_id ?? candidate.venueId;
  if (typeof rawVenueId !== "string" || !rawVenueId.trim() || rawVenueId.length > MAX_VENUE_ID_LENGTH) {
    return NextResponse.json({ error: "venue_id is required." }, { status: 400, headers: userHeaders });
  }
  if (candidate.vibe !== undefined && (typeof candidate.vibe !== "string" || !AllowedVibeValues.has(candidate.vibe))) {
    return NextResponse.json({ error: "Invalid vibe." }, { status: 400, headers: userHeaders });
  }

  const sanitizedBody = { ...candidate };
  for (const key of ["venue_id", "place_id", "venueId"]) {
    if (typeof sanitizedBody[key] === "string") {
      sanitizedBody[key] = sanitizeWriteId(sanitizedBody[key]);
    }
  }
  if (!sanitizeWriteId(rawVenueId)) {
    return NextResponse.json({ error: "venue_id is required." }, { status: 400, headers: userHeaders });
  }

  const parsed = PostBodySchema.safeParse(sanitizedBody);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: parsed.error.errors.map((e) => e.message).join("; ") },
        meta,
      },
      { status: 400, headers: userHeaders }
    );
  }

  const venue = await resolveVenue(normalizeVenueLookupId(selectedVenueId(parsed.data)));
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta },
      { status: 404, headers: userHeaders }
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
        { status: 429, headers: { ...userHeaders, "Retry-After": String(duplicateRetryAfterSeconds(duplicate.created_at)) } }
      );
    }
  } catch (error) {
    console.error("[check-ins POST] duplicate guard failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not validate report freshness." }, meta },
      { status: 500, headers: userHeaders }
    );
  }

  if (isSimpleCheckIn(parsed.data)) {
    const firstReport = await checkFirstReportOfNight(venue.id, userId).catch((error) => {
      console.error("[check-ins POST] first report lookup failed:", error);
      return false;
    });
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
        { status: 500, headers: userHeaders }
      );
    }

    const checkInId = (data as { id: string }).id;
    const events: string[] = [];
    let pointsAwarded = 0;
    let streakCount = 0;

    try {
      await updateUserScore(userId, 5, "checkin", "Venue check-in", checkInId);
      pointsAwarded += 5;
      events.push("checkin");

      if (firstReport) {
        await updateUserScore(userId, 5, "first_report", "First report for this venue tonight", checkInId);
        pointsAwarded += 5;
        events.push("first_report");
      }

      if (await checkStreakBonus(userId)) {
        await updateUserScore(userId, 20, "streak", "Three-night reporting streak", checkInId);
        pointsAwarded += 20;
        events.push("streak");
      }

      streakCount = await refreshStreakCount(userId);
    } catch (error) {
      console.error("[check-ins POST] rewards update failed:", error);
    }

    let userScore: Awaited<ReturnType<typeof getUserScore>> = null;
    try {
      userScore = await getUserScore(userId);
    } catch (error) {
      console.error("[check-ins POST] score lookup failed:", error);
    }

    return NextResponse.json({
      success: true,
      id: checkInId,
      status: "success",
      data: {
        id: checkInId,
        pointsAwarded,
        events,
        streakCount,
        newTotal: userScore?.points_total ?? pointsAwarded,
        level: userScore?.level ?? "newcomer",
      },
      meta,
    }, { status: 201, headers: userHeaders });
  }

  const reporterGender = await getReporterGender(userId);

  const insertPayload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    user_id: userId,
    busyness: normalizeBusyness(parsed.data.busyness as z.infer<typeof BusynessSchema>),
    crowd_feel: selectedCrowdFeel(parsed.data),
    gender: selectedGender(parsed.data),
    reporter_gender: reporterGender,
    gender_self_report: selectedGenderSelfReport(parsed.data),
    note: parsed.data.note ? sanitizeText(parsed.data.note) : null,
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
      await ensureGenderColumn();
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

  if (error && isMissingGenderColumn(error)) {
    try {
      await ensureGenderColumn();
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
      { status: 500, headers: userHeaders }
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
    { status: 201, headers: userHeaders }
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
