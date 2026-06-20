import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return json<never>(
        { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta },
        { status: 503 },
      );
    }
    throw error;
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return json<never>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to enable push notifications." }, meta },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json<never>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
      { status: 400 },
    );
  }

  const parsed = PushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return json<never>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: "endpoint, keys.auth, and keys.p256dh are required." },
        meta,
      },
      { status: 422 },
    );
  }

  const { endpoint, keys } = parsed.data;
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        auth: keys.auth,
        p256dh: keys.p256dh,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return json<never>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save push subscription." }, meta },
      { status: 500 },
    );
  }

  return json({ status: "success", data: { subscribed: true }, meta });
}
