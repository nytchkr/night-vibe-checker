// ============================================================
// POST /api/venues/[id]/report
// Anonymous venue metadata issue reports.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import type { APIResponse } from "@/types";

const ReportBodySchema = z.object({
  reason: z.enum(["wrong_hours", "wrong_location", "permanently_closed", "duplicate", "other"]),
  notes: z.string().trim().max(200).optional(),
});

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

async function resolveVenueId(venueIdOrPlaceId: string): Promise<string | null> {
  const { data, error } = await findVisibleVenueByIdOrPlaceId(venueIdOrPlaceId, "id, hidden");

  if (error || !data || data.hidden) return null;
  return data.id as string;
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

  const parsed = ReportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Choose a valid report reason." }, meta: responseMeta },
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
    .from("venue_reports")
    .insert({
      venue_id: venueId,
      user_id: null,
      reason: parsed.data.reason,
      notes: parsed.data.notes?.trim() || null,
    })
    .select("id, venue_id, reason, notes, created_at")
    .single();

  if (error || !data) {
    console.error("[venue-report POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue report." }, meta: responseMeta },
      { status: 500 },
    );
  }

  return NextResponse.json<APIResponse<{ report: typeof data }>>(
    { status: "success", data: { report: data }, meta: responseMeta },
    { status: 201 },
  );
}
