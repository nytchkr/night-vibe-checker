import type { NextRequest } from "next/server";
import { auth } from "@/auth";

export async function getAuthenticatedUserId(_req?: NextRequest): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getAuthenticatedUser() {
  const session = await auth();
  return session?.user ?? null;
}
