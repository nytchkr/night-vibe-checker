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

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(new URL("/admin/login", url.origin), { status: 303 });
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

  const response = NextResponse.json({ data: { ok: true }, ok: true });
  setAdminCookie(response);

  return response;
}
