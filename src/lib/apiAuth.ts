import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { assertSupabaseServerEnv, supabaseAdmin } from "@/lib/supabase";

export async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  assertSupabaseServerEnv();

  const cookieUserId = await getCookieUserId(req);
  if (cookieUserId) return cookieUserId;

  return getBearerUserId(req.headers.get("Authorization"));
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

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
