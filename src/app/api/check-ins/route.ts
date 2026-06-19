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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";
import type { LiveCheckIn, CheckInSummary, CrowdLevel } from "@/types/checkIn";

// --------------- Zod schemas --------------------------------

const MAX_VENUE_ID_LENGTH = 160;
const MAX_VENUE_NAME_LENGTH = 120;
const MAX_SESSION_ID_LENGTH = 120;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;
const MAX_WAIT_MINUTES = 240;
const SUMMARY_SCAN_LIMIT = 500;
const DUPLICATE_WINDOW_MINUTES = 10;
const SAFE_ID_PATTERN = /^[A-Za-z0-9:_-]+$/;
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 &'+#/-]*$/;

const PostBodySchema = z.object({
  venueId: z
    .string()
    .trim()
    .min(1, "venueId is required")
    .max(MAX_VENUE_ID_LENGTH, `venueId must be ${MAX_VENUE_ID_LENGTH} characters or fewer`)
    .regex(SAFE_ID_PATTERN, "venueId contains unsupported characters"),
  venueName: z
    .string()
    .trim()
    .min(1, "venueName is required")
    .max(MAX_VENUE_NAME_LENGTH, `venueName must be ${MAX_VENUE_NAME_LENGTH} characters or fewer`),
  crowdLevel:  z.enum(["quiet", "moderate", "packed", "wild"], {
    errorMap: () => ({ message: "crowdLevel must be quiet | moderate | packed | wild" }),
  }),
  vibeScore: z
    .number()
    .finite()
    .min(1.0, "vibeScore must be between 1 and 10")
    .max(10.0, "vibeScore must be between 1 and 10")
    .refine((value) => Number.isInteger(value * 10), "vibeScore can have at most one decimal place"),
  musicType:   z.enum(["house", "hiphop", "rnb", "techno", "live", "mixed", "none"]).optional(),
  waitMinutes: z
    .number()
    .int("waitMinutes must be a whole number")
    .min(0, "waitMinutes cannot be negative")
    .max(MAX_WAIT_MINUTES, `waitMinutes must be ${MAX_WAIT_MINUTES} or fewer`)
    .optional(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "tags cannot be blank")
        .max(MAX_TAG_LENGTH, `tags must be ${MAX_TAG_LENGTH} characters or fewer`)
        .regex(TAG_PATTERN, "tags contain unsupported characters")
    )
    .max(MAX_TAGS, `tags cannot include more than ${MAX_TAGS} items`)
    .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))])
    .optional(),
  note: z.string().trim().max(200).optional(),
  sessionId: z
    .string()
    .trim()
    .max(MAX_SESSION_ID_LENGTH, `sessionId must be ${MAX_SESSION_ID_LENGTH} characters or fewer`)
    .regex(SAFE_ID_PATTERN, "sessionId contains unsupported characters")
    .optional(),
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

async function hasRecentDuplicateCheckIn(args: {
  client: SupabaseClient;
  venueId: string;
  userId: string | null;
  sessionId?: string;
}) {
  const actorColumn = args.userId ? "user_id" : args.sessionId ? "session_id" : null;
  const actorValue = args.userId ?? args.sessionId;
  if (!actorColumn || !actorValue) return { duplicate: false, error: null };

  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await args.client
    .from("check_ins")
    .select("id")
    .eq("venue_id", args.venueId)
    .eq(actorColumn, actorValue)
    .gte("created_at", cutoff)
    .limit(1);

  return { duplicate: Boolean(data?.length), error };
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

  const recentCheck = await hasRecentDuplicateCheckIn({ client: anonClient, venueId, userId, sessionId });
  if (recentCheck.error) {
    console.error("[check-ins POST] rate guard DB error:", recentCheck.error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not validate check-in freshness." }, meta },
      { status: 500 }
    );
  }
  if (recentCheck.duplicate) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: {
          code: "DUPLICATE_CHECK_IN",
          message: `Only one check-in per venue is allowed every ${DUPLICATE_WINDOW_MINUTES} minutes.`,
        },
        meta,
      },
      { status: 429 }
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
  const venueId = searchParams.get("venueId")?.trim();
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "20", 10) || 20, 1), 100);

  const anonClient = buildAnonClient();
  if (!anonClient) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." }, meta },
      { status: 500 }
    );
  }

  // Feed mode: no venueId → return recent check-ins across all venues
  if (!venueId) {
    const safeLimit = Math.min(limit, 50);
    const { data, error } = await anonClient
      .from("check_ins")
      .select("id, venue_id, venue_name, crowd_level, vibe_score, music_type, wait_minutes, tags, note, user_id, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.error("[check-ins GET feed] DB error:", error);
      return NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "DB_ERROR", message: "Could not fetch check-in feed." }, meta },
        { status: 500 }
      );
    }

    const checkIns: LiveCheckIn[] = ((data ?? []) as Record<string, unknown>[]).map(rowToCheckIn);
    return NextResponse.json<APIResponse<{ checkIns: LiveCheckIn[] }>>(
      { status: "success", data: { checkIns }, meta },
      { status: 200 }
    );
  }

  // Venue mode: venueId provided → validate then return venue-scoped results + summary
  if (venueId.length > MAX_VENUE_ID_LENGTH || !SAFE_ID_PATTERN.test(venueId)) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "INVALID_PARAM", message: "venueId contains unsupported characters." }, meta },
      { status: 400 }
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

  const {
    data: summaryData,
    error: summaryError,
    count: summaryCount,
  } = await anonClient
    .from("check_ins")
    .select("crowd_level, vibe_score, created_at", { count: "exact" })
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(SUMMARY_SCAN_LIMIT);

  if (summaryError) {
    console.error("[check-ins GET] summary DB error:", summaryError);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch check-in summary." }, meta },
      { status: 500 }
    );
  }

  const summaryRows = (summaryData ?? []) as { crowd_level: string; vibe_score: number; created_at: string }[];
  const reportCount = summaryCount ?? summaryRows.length;
  const summaryReportCount = summaryRows.length;
  const avgVibeScore =
    summaryReportCount > 0
      ? Math.round((summaryRows.reduce((sum, c) => sum + c.vibe_score, 0) / summaryReportCount) * 10) / 10
      : 0;
  const dominant = summaryReportCount > 0 ? dominantCrowd(summaryRows) : "moderate";
  const lastReportAt = summaryReportCount > 0 ? summaryRows[0].created_at : new Date().toISOString();

  const summary: CheckInSummary = {
    venueId,
    avgVibeScore,
    dominantCrowd: dominant,
    reportCount,
    summaryReportCount,
    isSummaryPartial: reportCount > summaryReportCount,
    lastReportAt,
  };

  return NextResponse.json<APIResponse<{ checkIns: LiveCheckIn[]; summary: CheckInSummary }>>(
    { status: "success", data: { checkIns, summary }, meta },
    { status: 200 }
  );
}
