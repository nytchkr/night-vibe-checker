import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

/*
-- CREATE TABLE IF NOT EXISTS push_subscriptions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, endpoint text UNIQUE NOT NULL, p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz DEFAULT now());
-- CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
*/

export const dynamic = "force-dynamic";

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

function missingSupabaseConfigResponse(): NextResponse {
  return NextResponse.json(
    { error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY." },
    { status: 503 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return missingSupabaseConfigResponse();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (authError || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = PushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "endpoint, keys.auth, and keys.p256dh are required." },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
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
    return NextResponse.json({ error: "Could not save push subscription." }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true }, ok: true });
}
