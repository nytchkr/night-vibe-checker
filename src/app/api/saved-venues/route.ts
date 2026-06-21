// ============================================================
// GET/POST/DELETE /api/saved-venues
// Authenticated saved venue IDs for the current user.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

const BodySchema = z.object({
  venueId: z.string().trim().min(1).max(200),
});

const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  venueIds: string[];
  savedVenueIds: string[];
};

type SavedVenueMutationResponse = APIResponse<{ venueId: string; saved: boolean }> & {
  venueId: string;
  saved: boolean;
};

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function getCookieUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function getUserId(req: NextRequest): Promise<string | null> {
  return (await getCookieUserId()) ?? (await getBearerUserId(req.headers.get("Authorization")));
}

function missingSupabaseConfigResponse(
  error: unknown,
  meta: { cached: boolean; generatedAt: string; requestId: string },
  headers?: HeadersInit
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  console.error("[saved-venues] Supabase configuration error:", error.message);
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta },
    { status: 503, headers }
  );
}

function unauthorized(meta: { cached: boolean; generatedAt: string; requestId: string }, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to save venues." }, meta },
    { status: 401, headers }
  );
}

async function readVenueId(req: NextRequest, meta: { cached: boolean; generatedAt: string; requestId: string }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
        { status: 400 }
      ),
    };
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "VALIDATION_ERROR", message: "venueId is required." }, meta },
        { status: 422 }
      ),
    };
  }

  return { venueId: parsed.data.venueId };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta, PRIVATE_GET_CACHE_HEADERS);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta, PRIVATE_GET_CACHE_HEADERS);

  const { data, error } = await supabaseAdmin
    .from("saved_venues")
    .select("venue_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[saved-venues GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch saved venues." }, meta },
      { status: 500, headers: PRIVATE_GET_CACHE_HEADERS }
    );
  }

  const savedVenueIds = (data ?? []).map((row) => row.venue_id as string);

  return NextResponse.json<SavedVenueIdsResponse>({
    status: "success",
    venueIds: savedVenueIds,
    savedVenueIds,
    data: { savedVenueIds },
    meta,
  }, { headers: PRIVATE_GET_CACHE_HEADERS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  const { error } = await supabaseAdmin.from("saved_venues").upsert(
    { user_id: userId, venue_id: parsed.venueId },
    { onConflict: "user_id,venue_id" }
  );

  if (error) {
    console.error("[saved-venues POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue." }, meta },
      { status: 500 }
    );
  }

  return NextResponse.json<SavedVenueMutationResponse>({
    status: "success",
    venueId: parsed.venueId,
    saved: true,
    data: { venueId: parsed.venueId, saved: true },
    meta,
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  const { error } = await supabaseAdmin
    .from("saved_venues")
    .delete()
    .eq("user_id", userId)
    .eq("venue_id", parsed.venueId);

  if (error) {
    console.error("[saved-venues DELETE] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not unsave venue." }, meta },
      { status: 500 }
    );
  }

  return NextResponse.json<SavedVenueMutationResponse>({
    status: "success",
    venueId: parsed.venueId,
    saved: false,
    data: { venueId: parsed.venueId, saved: false },
    meta,
  });
}
