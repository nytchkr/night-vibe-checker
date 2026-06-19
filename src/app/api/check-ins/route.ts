// ============================================================
// POST /api/check-ins  — submit a live crowd/vibe check-in
// GET  /api/check-ins  — fetch latest check-ins + summary for a venue
//
// POST body: { venueId, venueName, crowdLevel, vibeScore, musicType?,
//              waitMinutes?, tags?, note?, sessionId? }
// GET query: ?venueId=<id>&limit=<n>   (limit defaults to 20)
//
// Auth: optional for both methods (anonymous check-ins supported via sessionId)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";
import type { LiveCheckIn, CheckInSummary, CrowdLevel } from "@/types/checkIn";

// --------------- Zod schemas --------------------------------

const PostBodySchema = z.object({
  venueId:     z.string().min(1, "venueId is required"),
  venueName:   z.string().min(1, "venueName is required"),
  crowdLevel:  z.enum(["quiet", "moderate", "packed", "wild"], {
    errorMap: () => ({ message: "crowdLevel must be quiet | moderate | packed | wild" }),
  }),
  vibeScore:   z.number().min(1.0).max(10.0),
  musicType:   z.enum(["house", "hiphop", "rnb", "techno", "live", "mixed", "none"]).optional(),
  waitMinutes: z.number().int().min(0).optional(),
  tags:        z.array(z.string()).optional(),
  note:        z.string().max(200).optional(),
  sessionId:   z.string().optional(),
});

// --------------- Helpers ------------------------------------

function buildAnonClient() {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;
  return createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Extract user_id from Bearer token if present; null for anonymous */
async function maybeGetUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
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

/** Compute the mode (most frequent) crowd_level from an array of rows */
function dominantCrowd(rows: { crowd_level: string }[]): CrowdLevel {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.crowd_level] = (counts[r.crowd_level] ?? 0) + 1;
  }
  let best: CrowdLevel = "moderate";
  let bestN = 0;
  for (const [level, n] of Object.entries(counts)) {
    if (n > bestN) {
      bestN = n;
      best = level as CrowdLevel;
    }
  }
  return best;
}

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

// --------------- POST handler --------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId  = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  // Parse body
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
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.errors.map((e) => e.message).join("; "),
        },
        meta,
      },
      { status: 422 }
    );
  }

  const { venueId, venueName, crowdLevel, vibeScore, musicType, waitMinutes, tags, note, sessionId } = parsed.data;

  // Optionally resolve user_id from auth token
  const userId = await maybeGetUserId(req.headers.get("Authorization"));

  const anonClient = buildAnonClient();
  if (!anonClient) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." }, meta },
      { status: 500 }
    );
  }

  const { data, error } = await anonClient
    .from("check_ins")
    .insert({
      venue_id:    venueId,
      venue_name:  venueName,
      crowd_level: crowdLevel,
      vibe_score:  vibeScore,
      music_type:  musicType ?? null,
      wait_minutes: waitMinutes ?? null,
      tags:        tags ?? [],
      note:        note ?? null,
      user_id:     userId ?? null,
      session_id:  sessionId ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[check-ins POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save check-in." }, meta },
      { status: 500 }
    );
  }

  const checkIn = rowToCheckIn(data as Record<string, unknown>);

  return NextResponse.json<APIResponse<{ checkIn: LiveCheckIn }>>(
    { status: "success", data: { checkIn }, meta },
    { status: 201 }
  );
}

// --------------- GET handler --------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId   = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "20", 10) || 20, 1), 100);

  if (!venueId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "MISSING_PARAM", message: "venueId query parameter is required." }, meta },
      { status: 400 }
    );
  }

  const anonClient = buildAnonClient();
  if (!anonClient) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." }, meta },
      { status: 500 }
    );
  }

  const { data, error } = await anonClient
    .from("check_ins")
    .select("id, venue_id, venue_name, crowd_level, vibe_score, music_type, wait_minutes, tags, note, user_id, session_id, created_at")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[check-ins GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch check-ins." }, meta },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const checkIns: LiveCheckIn[] = rows.map(rowToCheckIn);

  // Compute summary
  const reportCount = checkIns.length;
  const avgVibeScore =
    reportCount > 0
      ? Math.round((checkIns.reduce((sum, c) => sum + c.vibeScore, 0) / reportCount) * 10) / 10
      : 0;
  const dominant = dominantCrowd(rows as { crowd_level: string }[]);
  const lastReportAt = reportCount > 0 ? checkIns[0].createdAt : new Date().toISOString();

  const summary: CheckInSummary = {
    venueId,
    avgVibeScore,
    dominantCrowd: dominant,
    reportCount,
    lastReportAt,
  };

  return NextResponse.json<APIResponse<{ checkIns: LiveCheckIn[]; summary: CheckInSummary }>>(
    { status: "success", data: { checkIns, summary }, meta },
    { status: 200 }
  );
}
