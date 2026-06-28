import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { getClientIp } from "@/lib/apiSecurity";
import { checkRateLimit, rateLimitHeaders, retryAfterSeconds } from "@/lib/upstashRateLimit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const POST_RATE_LIMIT_MAX = 5;
const POST_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

const DeleteSubscriptionSchema = z.object({
  endpoint: z.string().url().optional(),
});

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rate = await checkRateLimit(
    `push:subscribe:POST:${getClientIp(req)}`,
    POST_RATE_LIMIT_MAX,
    POST_RATE_LIMIT_WINDOW_MS,
  );
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many subscription attempts. Try again later." },
      { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds(rate, POST_RATE_LIMIT_WINDOW_MS)) } },
    );
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  const parsed = PushSubscriptionSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "endpoint, keys.auth, and keys.p256dh are required." },
      { status: 400, headers },
    );
  }

  const { endpoint, keys } = parsed.data;
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, auth, p256dh, created_at)
    VALUES (${userId}, ${endpoint}, ${keys.auth}, ${keys.p256dh}, now())
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      auth = EXCLUDED.auth,
      p256dh = EXCLUDED.p256dh
  `;

  return NextResponse.json({ data: { ok: true }, ok: true }, { headers });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = DeleteSubscriptionSchema.safeParse(await readJson(req));
  if (parsed.success && parsed.data.endpoint) {
    await sql`
      DELETE FROM push_subscriptions
      WHERE user_id = ${userId}
        AND endpoint = ${parsed.data.endpoint}
    `;
  } else {
    await sql`
      DELETE FROM push_subscriptions
      WHERE user_id = ${userId}
    `;
  }

  return NextResponse.json({ data: { ok: true }, ok: true });
}
