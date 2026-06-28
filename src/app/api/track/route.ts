import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { checkRateLimit, rateLimitHeaders } from "@/lib/upstashRateLimit";

const TRACK_RATE_LIMIT_MAX = 30;
const TRACK_RATE_LIMIT_WINDOW_MS = 60_000;

const TrackBodySchema = z.object({
  event: z.string().trim().min(1).max(120),
  venueId: z.string().uuid().optional(),
  meta: z.record(z.unknown()).optional(),
});

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      console.error("[track] Supabase configuration error:", error.message);
      return jsonError("Server configuration is incomplete.", 503);
    }
    throw error;
  }

  const ip = getClientIp(req);
  const rate = await checkRateLimit(`track:POST:${ip}`, TRACK_RATE_LIMIT_MAX, TRACK_RATE_LIMIT_WINDOW_MS);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? TRACK_RATE_LIMIT_WINDOW_MS) / 1000);
    return NextResponse.json(
      { error: "Too many tracking requests." },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers });
  }

  const parsed = TrackBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors.map((error) => error.message).join("; ") }, { status: 400, headers });
  }

  const { error } = await supabaseAdmin.from("analytics_events").insert({
    event: parsed.data.event,
    venue_id: parsed.data.venueId ?? null,
    user_id: null,
    ip_hash: hashIp(ip),
    meta: parsed.data.meta ?? null,
  });

  if (error) {
    console.error("[track] insert failed:", error);
    return NextResponse.json({ error: "Could not record event." }, { status: 500, headers });
  }

  return new NextResponse(null, { status: 204, headers });
}
