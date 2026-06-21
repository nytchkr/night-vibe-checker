import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

function safeReturnUrl(value: string | null): string {
  if (!value || value === "/" || value === "/map" || !value.startsWith("/") || value.startsWith("//")) {
    return "/profile";
  }
  return value;
}

function authFailedUrl(origin: string, message: string): string {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_failed");
  url.searchParams.set("message", message);
  return url.toString();
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawReturnUrl = searchParams.get("return");
  const returnUrl = safeReturnUrl(rawReturnUrl);
  const redirectUrl = rawReturnUrl
    ? `${origin}${returnUrl}`
    : `${origin}/login?auth=callback`;

  if (code) {
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesList) => {
            cookiesList.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(authFailedUrl(origin, "Could not finish sign-in. Please try again."));
    }

    return response;
  }

  return NextResponse.redirect(`${origin}${returnUrl}`);
}
