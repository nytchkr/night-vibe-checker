import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
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

  await sql`
    INSERT INTO analytics_events (event, venue_id, user_id, ip_hash, meta)
    VALUES (
      ${parsed.data.event},
      ${parsed.data.venueId ?? null},
      NULL,
      ${hashIp(ip)},
      ${JSON.stringify(parsed.data.meta ?? null)}::jsonb
    )
  `;

  return new NextResponse(null, { status: 204, headers });
}
