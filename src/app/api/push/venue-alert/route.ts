// ============================================================
// GET/POST/DELETE /api/push/venue-alert
// Authenticated venue-level push alert subscriptions.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

const VenueAlertSchema = z.object({
  venueId: z.string().trim().min(1, "venueId is required"),
});

const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

type ResponseMeta = {
  cached: boolean;
  generatedAt: string;
  requestId: string;
};

type VenueAlertStateResponse = APIResponse<{ venueId: string; alerting: boolean }> & {
  venueId: string;
  alerting: boolean;
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

  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function getUserId(req: NextRequest): Promise<string | null> {
  return (await getCookieUserId()) ?? (await getBearerUserId(req.headers.get("Authorization")));
}

function responseMeta(): ResponseMeta {
  return { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };
}

function missingSupabaseConfigResponse(
  error: unknown,
  meta: ResponseMeta,
  headers?: HeadersInit,
): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  console.error("[push venue-alert] Supabase configuration error:", error.message);
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta },
    { status: 503, headers },
  );
}

function unauthorized(meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to manage venue alerts." }, meta },
    { status: 401, headers },
  );
}

function validationError(meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "VALIDATION_ERROR", message: "venueId is required." }, meta },
    { status: 422, headers },
  );
}

async function readVenueId(req: NextRequest, meta: ResponseMeta) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
        { status: 400 },
      ),
    };
  }

  const parsed = VenueAlertSchema.safeParse(body);
  if (!parsed.success) {
    return { response: validationError(meta) };
  }

  return { venueId: parsed.data.venueId };
}

function stateResponse(venueId: string, alerting: boolean, meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<VenueAlertStateResponse>({
    status: "success",
    venueId,
    alerting,
    data: { venueId, alerting },
    meta,
  }, { headers });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingSupabaseConfigResponse(error, meta, PRIVATE_GET_CACHE_HEADERS);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta, PRIVATE_GET_CACHE_HEADERS);

  const parsed = VenueAlertSchema.safeParse({
    venueId: req.nextUrl.searchParams.get("venueId") ?? "",
  });
  if (!parsed.success) return validationError(meta, PRIVATE_GET_CACHE_HEADERS);

  const { data, error } = await supabaseAdmin
    .from("push_venue_alerts")
    .select("id")
    .eq("user_id", userId)
    .eq("venue_id", parsed.data.venueId)
    .maybeSingle();

  if (error) {
    console.error("[push venue-alert GET] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch venue alert state." }, meta },
      { status: 500, headers: PRIVATE_GET_CACHE_HEADERS },
    );
  }

  return stateResponse(parsed.data.venueId, Boolean(data), meta, PRIVATE_GET_CACHE_HEADERS);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

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

  const { error } = await supabaseAdmin.from("push_venue_alerts").upsert(
    { user_id: userId, venue_id: parsed.venueId },
    { onConflict: "user_id,venue_id" },
  );

  if (error) {
    console.error("[push venue-alert POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue alert." }, meta },
      { status: 500 },
    );
  }

  return stateResponse(parsed.venueId, true, meta);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

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
    .from("push_venue_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("venue_id", parsed.venueId);

  if (error) {
    console.error("[push venue-alert DELETE] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not remove venue alert." }, meta },
      { status: 500 },
    );
  }

  return stateResponse(parsed.venueId, false, meta);
}
