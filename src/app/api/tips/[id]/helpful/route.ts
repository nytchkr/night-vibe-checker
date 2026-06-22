// ============================================================
// POST /api/tips/[id]/helpful
// Public helpful vote endpoint for venue tips.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { getClientIp } from "@/lib/apiSecurity";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import type { APIResponse } from "@/types";

const TipIdSchema = z.string().uuid();
const HELPFUL_RATE_LIMIT_MAX = 10;
const HELPFUL_RATE_LIMIT_WINDOW_MS = 60_000;

type HelpfulTip = {
  id: string;
  helpfulCount: number;
};

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

  const rate = checkRateLimit(`tip-helpful:POST:${getClientIp(req)}`, HELPFUL_RATE_LIMIT_MAX, HELPFUL_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? HELPFUL_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many helpful votes. Try again shortly." }, meta: responseMeta },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  const { id: rawId } = await params;
  const parsed = TipIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Tip id must be a UUID." }, meta: responseMeta },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("increment_venue_tip_helpful", { tip_id: parsed.data });
  const row = Array.isArray(data) ? data[0] : null;

  if (error) {
    console.error("[tip-helpful POST] DB error:", error);
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not mark tip helpful." }, meta: responseMeta },
      { status: 500 },
    );
  }

  if (!row) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "TIP_NOT_FOUND", message: "Tip was not found." }, meta: responseMeta },
      { status: 404 },
    );
  }

  const tip: HelpfulTip = {
    id: row.id as string,
    helpfulCount: Number(row.helpful_count ?? 0),
  };

  return NextResponse.json<APIResponse<{ tip: HelpfulTip }>>({
    status: "success",
    data: { tip },
    meta: responseMeta,
  }, { headers });
}
