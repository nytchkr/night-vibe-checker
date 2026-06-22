import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieToken, isValidAdminPassword } from "@/lib/adminPasswordAuth";

function setAdminCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: getAdminCookieToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin";
  return value;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const password = url.searchParams.get("pw");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!isValidAdminPassword(password)) {
    return NextResponse.redirect(new URL("/admin?error=1", url.origin));
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  setAdminCookie(response);
  return response;
}

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
  setAdminCookie(response);

  return response;
}
