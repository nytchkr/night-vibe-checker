import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

function configError(error: unknown) {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string | null;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (error) {
    const response = configError(error);
    if (response) return response;
    throw error;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PushSubscriptionSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "endpoint, keys.auth, and keys.p256dh are required." },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      auth: keys.auth,
      p256dh: keys.p256dh,
      created_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push subscribe POST] DB error:", error);
    return NextResponse.json({ error: "Could not save push subscription." }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true }, ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  let userId: string | null;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (error) {
    const response = configError(error);
    if (response) return response;
    throw error;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = DeleteSubscriptionSchema.safeParse(await readJson(req));
  let query = supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);
  if (parsed.success && parsed.data.endpoint) query = query.eq("endpoint", parsed.data.endpoint);

  const { error } = await query;
  if (error) {
    console.error("[push subscribe DELETE] DB error:", error);
    return NextResponse.json({ error: "Could not remove push subscription." }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true }, ok: true });
}
