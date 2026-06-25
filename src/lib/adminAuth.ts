import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { assertSupabaseServerEnv, supabaseAdmin } from "@/lib/supabase";

export type AdminUser = {
  id: string;
  email: string | null;
};

type RoleRow = {
  role?: string | null;
};

async function userHasAdminRole(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return (data as RoleRow).role === "admin";
}

async function getCookieUserForPage(): Promise<AdminUser | null> {
  assertSupabaseServerEnv();

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

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

export async function requireAdminPage(returnPath = "/admin"): Promise<AdminUser> {
  const user = await getCookieUserForPage();

  if (!user) {
    redirect(`/login?return=${encodeURIComponent(returnPath)}`);
  }

  const isAdmin = await userHasAdminRole(user.id);
  if (!isAdmin) redirect("/");

  return user;
}

export async function requireAdminApi(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const userId = await getAuthenticatedUserId(req);

  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const isAdmin = await userHasAdminRole(userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return { userId };
}
