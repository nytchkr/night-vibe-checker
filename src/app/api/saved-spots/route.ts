// ============================================================
// GET    /api/saved-spots  — list saved venues for authenticated user
// POST   /api/saved-spots  — save a venue for the authenticated user
// DELETE /api/saved-spots  — remove a saved venue
//
// All methods require a valid Supabase JWT in:
//   Authorization: Bearer <access_token>
//
// POST body:   { venueId: string; venueName: string }
// DELETE body: { venueId: string }
//
// Returns: APIResponse<{ saved: boolean }> | APIResponse<{ spots: SavedSpot[] }>
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, SavedSpot, VibeTagValue } from "@/types";

// --------------- Schema definitions ------------------------

const PostBodySchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  venueName: z.string().min(1, "venueName is required"),
});

const DeleteBodySchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
});

// --------------- Auth helper --------------------------------

/**
 * Extracts and validates the Bearer token from the Authorization header.
 * Returns the Supabase user ID on success, or null if the token is missing
 * or invalid.
 */
async function getUserIdFromToken(
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Build a per-request Supabase client that validates the JWT against the
  // project's JWKS without service-role privileges.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
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

// --------------- GET handler --------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  const userId = await getUserIdFromToken(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Valid authentication token required." }, meta },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." }, meta },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await adminClient
    .from("saved_spots")
    .select("*, venues(name, address, place_id)")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) {
    console.error("[saved-spots GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch saved spots." }, meta },
      { status: 500 }
    );
  }

  const spots: SavedSpot[] = (data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    venueId: (row.venues as { place_id?: string } | null)?.place_id ?? (row.venue_id as string),
    venueName: (row.venues as { name?: string } | null)?.name ?? "",
    address: (row.venues as { address?: string } | null)?.address ?? "",
    vibeScoreSnapshot: row.vibe_score_snapshot ?? undefined,
    savedAt: row.saved_at as string,
    tags: ((row.tags_snapshot as string[]) ?? []) as VibeTagValue[],
  }));

  return NextResponse.json<APIResponse<{ spots: SavedSpot[] }>>(
    { status: "success", data: { spots }, meta },
    { status: 200 }
  );
}

// --------------- POST handler ------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  // Auth
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

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
        meta,
      },
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

  const { venueId, venueName } = parsed.data;

  // Build a service-role client for the insert (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." },
        meta,
      },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await adminClient.from("saved_spots").insert({
    user_id: userId,
    venue_id: venueId,
    venue_name: venueName,
    saved_at: new Date().toISOString(),
  });

  if (error) {
    // Unique-constraint violation — already saved, treat as success
    if (error.code === "23505") {
      return NextResponse.json<APIResponse<{ saved: boolean }>>(
        { status: "success", data: { saved: true }, meta },
        { status: 200 }
      );
    }
    console.error("[saved-spots POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not save spot." },
        meta,
      },
      { status: 500 }
    );
  }

  return NextResponse.json<APIResponse<{ saved: boolean }>>(
    { status: "success", data: { saved: true }, meta },
    { status: 200 }
  );
}

// --------------- DELETE handler ----------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  // Auth
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

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
        meta,
      },
      { status: 400 }
    );
  }

  const parsed = DeleteBodySchema.safeParse(body);
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

  const { venueId } = parsed.data;

  // Build service-role client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "SERVER_MISCONFIGURED", message: "Service unavailable." },
        meta,
      },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await adminClient
    .from("saved_spots")
    .delete()
    .eq("user_id", userId)
    .eq("venue_id", venueId);

  if (error) {
    console.error("[saved-spots DELETE] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not remove saved spot." },
        meta,
      },
      { status: 500 }
    );
  }

  return NextResponse.json<APIResponse<{ saved: boolean }>>(
    { status: "success", data: { saved: false }, meta },
    { status: 200 }
  );
}
