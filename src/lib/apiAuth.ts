import type { NextRequest } from "next/server";

async function getSession() {
  const { auth } = await import("@/auth");
  return auth();
}

export async function getAuthenticatedUserId(_req?: NextRequest): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function getAuthenticatedUser() {
  const session = await getSession();
  return session?.user ?? null;
}
