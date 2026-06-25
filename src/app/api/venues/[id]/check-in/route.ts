// ============================================================
// POST /api/venues/[id]/check-in
// Authenticated venue-scoped crowd report.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { recomputeVenueSignal } from "@/lib/signals";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { getClientIp } from "@/lib/apiSecurity";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { distanceMeters } from "@/lib/distance";
import {
  checkAbuseSoftSignals,
  checkFirstReportOfNight,
  checkStreakBonus,
  flagUserForReview,
  getUserScore,
  refreshStreakCount,
  updateUserScore,
} from "@/lib/rewards";
import type { APIResponse, ConsumerCheckIn, VenueSignal } from "@/types";

const VIBE_NOTE_MAX_LENGTH = 500;
const POST_RATE_LIMIT_MAX = 5;
const POST_RATE_LIMIT_WINDOW_MS = 60_000;
const PROXIMITY_GATE_METERS = 150;
const VENUE_REPEAT_WINDOW_MINUTES = 90;
const NIGHTLY_REPORT_LIMIT = 6;

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

const BusynessSchema = z.union([
  z.enum(["dead", "moderate", "packed"]),
  z.number().min(0).max(100),
]);

const GenderSchema = z.enum(["M", "F", "prefer_not", "m", "f", "nb", "man", "woman"]);

const CheckInBodySchema = z.object({
  busyness: BusynessSchema,
  crowd_feel: CrowdFeelSchema,
  note: z.string().trim().max(VIBE_NOTE_MAX_LENGTH).optional(),
  gender: GenderSchema.nullable().optional(),
  gender_self_report: z.enum(["m", "f", "nb"]).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

function genderToSelfReport(gender: z.infer<typeof GenderSchema> | null | undefined): "m" | "f" | "nb" | null {
  if (gender === "m" || gender === "f" || gender === "nb") return gender;
  if (gender === "M") return "m";
  if (gender === "F") return "f";
  if (gender === "man") return "m";
  if (gender === "woman") return "f";
  return null;
}

function genderToCanonical(gender: z.infer<typeof GenderSchema> | null | undefined): "M" | "F" | "prefer_not" {
  if (gender === "M" || gender === "m" || gender === "man") return "M";
  if (gender === "F" || gender === "f" || gender === "woman") return "F";
  return "prefer_not";
}

function selectedGenderSelfReport(data: z.infer<typeof CheckInBodySchema>): "m" | "f" | "nb" | null {
  if ("gender" in data) return genderToSelfReport(data.gender);
  return data.gender_self_report ?? null;
}

function selectedGender(data: z.infer<typeof CheckInBodySchema>): "M" | "F" | "prefer_not" {
  return genderToCanonical(data.gender ?? data.gender_self_report ?? null);
}

function normalizeBusyness(busyness: z.infer<typeof BusynessSchema>): "dead" | "moderate" | "packed" {
  if (typeof busyness === "string") return busyness;
  if (busyness <= 33) return "dead";
  if (busyness >= 67) return "packed";
  return "moderate";
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

function meta(requestId: string) {
  return { cached: false, generatedAt: new Date().toISOString(), requestId };
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

async function getReporterGender(userId: string): Promise<"male" | "female" | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("gender")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[venue-check-in POST] profile gender lookup failed:", error);
    return null;
  }

  return normalizeReporterGender(data?.gender);
}

async function resolveVenue(
  venueIdOrPlaceId: string,
): Promise<{ id: string; place_id: string | null; lat: number | null; lng: number | null } | null> {
  const { data, error } = await findVisibleVenueByIdOrPlaceId(venueIdOrPlaceId, "id, place_id, lat, lng, hidden");

  if (error || !data || data.hidden) return null;
  return {
    id: data.id as string,
    place_id: (data.place_id ?? null) as string | null,
    lat: typeof data.lat === "number" ? data.lat : data.lat == null ? null : Number(data.lat),
    lng: typeof data.lng === "number" ? data.lng : data.lng == null ? null : Number(data.lng),
  };
}

async function getRecentVenueCheckIn(venueId: string, userId: string): Promise<{ id: string; created_at: string } | null> {
  const cutoff = new Date(Date.now() - VENUE_REPEAT_WINDOW_MINUTES * 60_000).toISOString();
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

async function getNightlyCheckInCount(userId: string): Promise<number> {
  const { start, end } = getNewYorkDayWindow();
  const { count, error } = await supabaseAdmin
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw error;
  return count ?? 0;
}

function getNewYorkDayWindow(now = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const start = zonedDateTimeToUtc(year, month, day, 0, 0, 0, "America/New_York");
  const end = zonedDateTimeToUtc(year, month, day + 1, 0, 0, 0, "America/New_York");
  return { start, end };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function retryAfterSeconds(createdAt: string): number {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return VENUE_REPEAT_WINDOW_MINUTES * 60;
  const retryMs = VENUE_REPEAT_WINDOW_MINUTES * 60_000 - (Date.now() - createdMs);
  return Math.max(1, Math.ceil(retryMs / 1000));
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

  const rate = checkRateLimit(`venue-check-in:POST:${getClientIp(req)}`, POST_RATE_LIMIT_MAX, POST_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? POST_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many check-ins. Try again shortly." }, meta: responseMeta },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to report the vibe." }, meta: responseMeta },
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

  const parsed = CheckInBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Choose a busyness and crowd feel." }, meta: responseMeta },
      { status: 400 },
    );
  }

  const venue = await resolveVenue(requestedVenueId);
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta: responseMeta },
      { status: 404 },
    );
  }

  try {
    const duplicate = await getRecentVenueCheckIn(venue.id, userId);
    if (duplicate) {
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "RATE_LIMITED", message: "You've already reported this venue recently" }, meta: responseMeta },
        { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds(duplicate.created_at)) } },
      );
    }

    const nightlyCount = await getNightlyCheckInCount(userId);
    if (nightlyCount >= NIGHTLY_REPORT_LIMIT) {
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "RATE_LIMITED", message: "You've hit your report limit for tonight" }, meta: responseMeta },
        { status: 429, headers },
      );
    }
  } catch (error) {
    console.error("[venue-check-in POST] rate guard failed:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not validate report limits." }, meta: responseMeta },
      { status: 500, headers },
    );
  }

  const hasReportedLocation = parsed.data.lat != null && parsed.data.lng != null;
  const reportedDistanceMeters =
    hasReportedLocation && venue.lat != null && venue.lng != null
      ? distanceMeters(parsed.data.lat as number, parsed.data.lng as number, venue.lat, venue.lng)
      : null;

  if (reportedDistanceMeters != null && reportedDistanceMeters > PROXIMITY_GATE_METERS) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "PROXIMITY_REQUIRED", message: "You'll need to be closer to the venue to report the vibe" },
        meta: responseMeta,
      },
      { status: 403, headers },
    );
  }

  const reporterGender = await getReporterGender(userId);

  const insertPayload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    user_id: userId,
    busyness: normalizeBusyness(parsed.data.busyness),
    crowd_feel: parsed.data.crowd_feel,
    gender: selectedGender(parsed.data),
    reporter_gender: reporterGender,
    gender_self_report: selectedGenderSelfReport(parsed.data),
    note: parsed.data.note?.trim() || null,
    lat_reported: parsed.data.lat ?? null,
    lng_reported: parsed.data.lng ?? null,
    distance_from_venue_m: reportedDistanceMeters,
  };

  const insertResult = await supabaseAdmin
    .from("check_ins")
    .insert(insertPayload)
    .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at")
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
        .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at")
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
        .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at")
        .single();
      data = retry.data;
      error = retry.error;
    } catch (ensureError) {
      error = ensureError;
    }
  }

  if (error || !data) {
    console.error("[venue-check-in POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save vibe report." }, meta: responseMeta },
      { status: 500 },
    );
  }

  const events: string[] = [];
  let pointsAwarded = 0;
  try {
    if (hasReportedLocation) {
      await updateUserScore(userId, 5, "checkin", "Verified proximity check-in", data.id as string);
      pointsAwarded += 5;
      events.push("checkin");
    } else {
      await updateUserScore(userId, 0, "checkin", "Check-in accepted without location permission", data.id as string);
      events.push("checkin_no_location");
    }

    if (await checkFirstReportOfNight(venue.id, userId)) {
      await updateUserScore(userId, 5, "first_report", "First report for this venue tonight", data.id as string);
      pointsAwarded += 5;
      events.push("first_report");
    }

    if (await checkStreakBonus(userId)) {
      await updateUserScore(userId, 20, "streak", "Three-night reporting streak", data.id as string);
      pointsAwarded += 20;
      events.push("streak");
    }
    await refreshStreakCount(userId);

    if (hasReportedLocation) {
      const abuseSignals = await checkAbuseSoftSignals(userId, venue.id, parsed.data.lat as number, parsed.data.lng as number);
      if (abuseSignals.shouldFlag) {
        await flagUserForReview(userId);
        events.push("flagged_for_review");
      }
    }
  } catch (error) {
    console.error("[venue-check-in POST] rewards update failed:", error);
  }

  const userScore = await getUserScore(userId).catch((error) => {
    console.error("[venue-check-in POST] score lookup failed:", error);
    return null;
  });

  let signal: VenueSignal | undefined;
  try {
    signal = mapSignal((await recomputeVenueSignal(venue.id)) as Record<string, unknown>);
  } catch (error) {
    console.error("[venue-check-in POST] signal recompute failed:", error);
  }

  return NextResponse.json<APIResponse<{ checkIn: ConsumerCheckIn; signal?: VenueSignal; pointsAwarded: number; events: string[]; newTotal: number; level: string }>>(
    {
      status: "success",
      data: {
        checkIn: mapCheckIn(data as Record<string, unknown>),
        signal,
        pointsAwarded,
        events,
        newTotal: userScore?.points_total ?? pointsAwarded,
        level: userScore?.level ?? "newcomer",
      },
      meta: responseMeta,
    },
    { status: 200, headers },
  );
}
