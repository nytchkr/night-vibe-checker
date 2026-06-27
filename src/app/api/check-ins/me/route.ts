// ============================================================
// GET /api/check-ins/me — authenticated user's own reports
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "@/lib/supabase";
import type { APIResponse, ConsumerCheckIn } from "@/types";

async function getUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function mapCheckIn(row: Record<string, unknown>): ConsumerCheckIn {
  const venue = row.venues as { name?: unknown } | null | undefined;

  return {
    id: row.id as string,
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    venueName: venue?.name as string | undefined,
    busyness: row.busyness as ConsumerCheckIn["busyness"],
    crowdFeel: row.crowd_feel as ConsumerCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const meta = { cached: true, generatedAt: new Date().toISOString(), requestId };

  const userId = await getUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Valid authentication token required." }, meta },
      { status: 401 }
    );
  }

  const { data, error, count } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, place_id, busyness, crowd_feel, note, created_at, venues!inner(name)", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[check-ins/me GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch report history." }, meta },
      { status: 500 }
    );
  }

  const checkIns = ((data ?? []) as Record<string, unknown>[]).map(mapCheckIn);

  return NextResponse.json<APIResponse<{ checkIns: ConsumerCheckIn[]; totalCheckIns: number }>>({
    status: "success",
    data: { checkIns, totalCheckIns: count ?? checkIns.length },
    meta,
  });
}
