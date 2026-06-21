import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieToken, isValidAdminPassword } from "@/lib/adminPasswordAuth";

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const password = typeof body === "object" && body !== null ? (body as { password?: unknown }).password : undefined;

  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: getAdminCookieToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
