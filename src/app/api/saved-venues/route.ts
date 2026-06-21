/*
-- CREATE TABLE IF NOT EXISTS saved_venues (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, place_id text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(user_id, place_id));
*/

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    place_id: z.string().trim().min(1).max(200).optional(),
    venueId: z.string().trim().min(1).max(200).optional(),
  })
  .transform((body) => ({ placeId: body.place_id ?? body.venueId }))
  .refine((body): body is { placeId: string } => Boolean(body.placeId), {
    message: "place_id is required.",
  });

const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  place_ids: string[];
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

async function getCookieUserId(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
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
  return (await getCookieUserId(req)) ?? (await getBearerUserId(req.headers.get("Authorization")));
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
        { status: "error", error: { code: "VALIDATION_ERROR", message: "place_id is required." }, meta },
        { status: 422 }
      ),
    };
  }

  return { placeId: parsed.data.placeId };
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
    place_ids: savedVenueIds,
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
    { user_id: userId, venue_id: parsed.placeId },
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
    ok: true,
    venueId: parsed.placeId,
    saved: true,
    data: { venueId: parsed.placeId, saved: true },
    meta,
  } as SavedVenueMutationResponse & { ok: true });
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
    .eq("venue_id", parsed.placeId);

  if (error) {
    console.error("[saved-venues DELETE] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not unsave venue." }, meta },
      { status: 500 }
    );
  }

  return NextResponse.json<SavedVenueMutationResponse>({
    status: "success",
    ok: true,
    venueId: parsed.placeId,
    saved: false,
    data: { venueId: parsed.placeId, saved: false },
    meta,
  } as SavedVenueMutationResponse & { ok: true });
}
