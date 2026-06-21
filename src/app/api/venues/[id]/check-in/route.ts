// ============================================================
// POST /api/venues/[id]/check-in
// Authenticated venue-scoped crowd report.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { recomputeVenueSignal } from "@/lib/signals";
import type { APIResponse, ConsumerCheckIn, VenueSignal } from "@/types";

const VIBE_NOTE_MAX_LENGTH = 120;

const CheckInBodySchema = z.object({
  busyness: z.enum(["dead", "moderate", "packed"]),
  crowd_feel: z.enum(["mostly_male", "mostly_female", "balanced", "mixed"]),
  note: z.string().trim().max(VIBE_NOTE_MAX_LENGTH).optional(),
  gender_self_report: z.enum(["m", "f"]).nullable().optional(),
});

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

function meta(requestId: string) {
  return { cached: false, generatedAt: new Date().toISOString(), requestId };
}

function missingSupabaseConfigResponse(
  error: unknown,
  responseMeta: { cached: boolean; generatedAt: string; requestId: string },
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta: responseMeta },
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

async function resolveVenue(venueIdOrPlaceId: string): Promise<{ id: string; place_id: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, hidden")
    .or(`id.eq.${venueIdOrPlaceId},place_id.eq.${venueIdOrPlaceId}`)
    .limit(1)
    .single();

  if (error || !data || data.hidden) return null;
  return {
    id: data.id as string,
    place_id: (data.place_id ?? null) as string | null,
  };
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

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to report the vibe." }, meta: responseMeta },
      { status: 401 },
    );
  }

  const { id: rawId } = await params;
  const requestedVenueId = rawId?.trim();
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
      { status: 422 },
    );
  }

  const venue = await resolveVenue(requestedVenueId);
  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VENUE_NOT_FOUND", message: "Venue is not available." }, meta: responseMeta },
      { status: 404 },
    );
  }

  const reporterGender = await getReporterGender(userId);

  const insertPayload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    user_id: userId,
    busyness: parsed.data.busyness,
    crowd_feel: parsed.data.crowd_feel,
    reporter_gender: reporterGender,
    gender_self_report: parsed.data.gender_self_report ?? null,
    note: parsed.data.note?.trim() || null,
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

  let signal: VenueSignal | undefined;
  try {
    signal = mapSignal((await recomputeVenueSignal(venue.id)) as Record<string, unknown>);
  } catch (error) {
    console.error("[venue-check-in POST] signal recompute failed:", error);
  }

  return NextResponse.json<APIResponse<{ checkIn: ConsumerCheckIn; signal?: VenueSignal }>>(
    { status: "success", data: { checkIn: mapCheckIn(data as Record<string, unknown>), signal }, meta: responseMeta },
    { status: 201 },
  );
}
