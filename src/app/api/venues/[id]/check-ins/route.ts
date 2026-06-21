// ============================================================
// GET /api/venues/[id]/check-ins
// Public recent vibe feed for a venue. Never returns user_id.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "@/lib/supabase";

const CHECK_IN_LIMIT = 10;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30",
};

type RecentCheckInRow = {
  id: string;
  busyness_0_to_100?: number | string | null;
  busyness?: "dead" | "moderate" | "packed" | null;
  crowd_feel?: string | null;
  note?: string | null;
  gender?: string | null;
  gender_self_report?: string | null;
  created_at: string;
};

export type RecentVenueCheckIn = {
  id: string;
  busynessLevel: number | null;
  crowdFeel: string | null;
  gender: "M" | "F" | null;
  createdAt: string;
};

function isMissingColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message?.toLowerCase() ?? "";
  return candidate?.code === "42703" || candidate?.code === "PGRST204" || message.includes("column");
}

function busynessToLevel(row: RecentCheckInRow): number | null {
  const numeric = Number(row.busyness_0_to_100);
  if (Number.isFinite(numeric)) return Math.min(100, Math.max(0, Math.round(numeric)));

  if (row.busyness === "dead") return 10;
  if (row.busyness === "moderate") return 50;
  if (row.busyness === "packed") return 90;
  return null;
}

function normalizeGender(value: string | null | undefined): "M" | "F" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "m" || normalized === "male") return "M";
  if (normalized === "w" || normalized === "f" || normalized === "female") return "F";
  return null;
}

function mapCheckIn(row: RecentCheckInRow): RecentVenueCheckIn {
  const note = (row.note ?? row.crowd_feel ?? "").trim();
  return {
    id: row.id,
    busynessLevel: busynessToLevel(row),
    crowdFeel: note || null,
    gender: normalizeGender(row.gender ?? row.gender_self_report),
    createdAt: row.created_at,
  };
}

async function resolveVenueId(venueIdOrPlaceId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, hidden")
    .or(`id.eq.${venueIdOrPlaceId},place_id.eq.${venueIdOrPlaceId}`)
    .limit(1)
    .single();

  if (error || !data || data.hidden) return null;
  return data.id as string;
}

async function fetchRecentCheckIns(venueId: string): Promise<{ data: RecentCheckInRow[] | null; error: unknown }> {
  const primary = await supabaseAdmin
    .from("check_ins")
    .select("id, busyness_0_to_100, crowd_feel, gender, created_at")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(CHECK_IN_LIMIT);

  if (!primary.error || !isMissingColumnError(primary.error)) {
    return {
      data: primary.data as RecentCheckInRow[] | null,
      error: primary.error,
    };
  }

  const fallback = await supabaseAdmin
    .from("check_ins")
    .select("id, busyness, note, gender_self_report, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(CHECK_IN_LIMIT);

  return {
    data: fallback.data as RecentCheckInRow[] | null,
    error: fallback.error,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = uuidv4();
  const { id: rawId } = await params;
  const requestedVenueId = rawId?.trim();

  if (!requestedVenueId) {
    return NextResponse.json(
      { error: { code: "MISSING_ID", message: "Venue id is required." }, requestId },
      { status: 400, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  const venueId = await resolveVenueId(requestedVenueId);
  if (!venueId) {
    return NextResponse.json(
      { error: { code: "VENUE_NOT_FOUND", message: "Venue was not found." }, requestId },
      { status: 404, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  const { data, error } = await fetchRecentCheckIns(venueId);
  if (error) {
    console.error("[venue-check-ins GET] DB error:", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not fetch recent check-ins." }, requestId },
      { status: 500, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  return NextResponse.json((data ?? []).map(mapCheckIn), {
    status: 200,
    headers: PUBLIC_CACHE_HEADERS,
  });
}
