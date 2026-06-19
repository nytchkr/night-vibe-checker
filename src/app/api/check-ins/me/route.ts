// ============================================================
// GET /api/check-ins/me — return the authenticated user's own check-ins
//
// Auth: required — Bearer token in Authorization header
// Returns: { checkIns: LiveCheckIn[] } newest first
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";
import type { LiveCheckIn, CrowdLevel } from "@/types/checkIn";

// --------------- Auth helper --------------------------------

async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
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

// --------------- Row mapper ---------------------------------

function rowToCheckIn(row: Record<string, unknown>): LiveCheckIn {
  return {
    id:          row.id as string,
    venueId:     row.venue_id as string,
    venueName:   row.venue_name as string,
    crowdLevel:  row.crowd_level as CrowdLevel,
    vibeScore:   row.vibe_score as number,
    musicType:   (row.music_type ?? undefined) as LiveCheckIn["musicType"],
    waitMinutes: (row.wait_minutes ?? undefined) as number | undefined,
    tags:        (row.tags as string[]) ?? [],
    note:        (row.note ?? undefined) as string | undefined,
    userId:      (row.user_id ?? undefined) as string | undefined,
    sessionId:   (row.session_id ?? undefined) as string | undefined,
    createdAt:   row.created_at as string,
  };
}

// --------------- GET handler --------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId   = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  // Require authentication
  const userId = await getUserIdFromToken(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "UNAUTHORIZED", message: "Valid authentication token required." },
        meta,
      },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." }, meta },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await adminClient
    .from("check_ins")
    .select("id, venue_id, venue_name, crowd_level, vibe_score, music_type, wait_minutes, tags, note, user_id, session_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[check-ins/me GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch check-in history." }, meta },
      { status: 500 }
    );
  }

  const checkIns: LiveCheckIn[] = ((data ?? []) as Record<string, unknown>[]).map(rowToCheckIn);

  return NextResponse.json<APIResponse<{ checkIns: LiveCheckIn[] }>>(
    { status: "success", data: { checkIns }, meta },
    { status: 200 }
  );
}
