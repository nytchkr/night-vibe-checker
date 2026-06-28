import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser, getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";

export type AdminUser = {
  id: string;
  email: string | null;
};

type RoleRow = {
  role?: string | null;
};

async function userHasAdminRole(userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT role
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `;

  const data = Array.isArray(rows) ? rows[0] : undefined;
  if (!data) return false;
  return (data as RoleRow).role === "admin";
}

async function hasAdminPassword(req: NextRequest): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;

  const headerPassword = req.headers.get("x-admin-password")?.trim();
  if (headerPassword && headerPassword === expected) return true;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ") && auth.slice(7).trim() === expected) return true;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return false;
  }

  try {
    const form = await req.clone().formData();
    return String(form.get("admin_password") ?? "").trim() === expected;
  } catch {
    return false;
  }
}

async function getCookieUserForPage(): Promise<AdminUser | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function requireAdminPage(returnPath = "/admin"): Promise<AdminUser> {
  const user = await getCookieUserForPage();

  if (!user) {
    redirect(`/sign-in?return=${encodeURIComponent(returnPath)}`);
  }

  const isAdmin = await userHasAdminRole(user.id);
  if (!isAdmin) redirect("/");

  return user;
}

export async function requireAdminApi(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (await hasAdminPassword(req)) return { userId: "admin-password" };

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
