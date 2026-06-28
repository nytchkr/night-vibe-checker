import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicRateLimit } from "@/lib/apiRateLimit";

function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/map";
  }
  return value;
}

export async function GET(req: NextRequest) {
  const rate = await publicRateLimit(req, "auth-google", 20);
  if (rate.response) return rate.response;

  const { searchParams, origin } = new URL(req.url);
  const rawReturn = searchParams.get("return");
  const returnUrl = safeReturnUrl(rawReturn);

  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin;

  const callbackUrl = `${siteOrigin}/auth/callback?return=${encodeURIComponent(returnUrl)}`;

  // Collect cookies to set before we have the redirect URL.
  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => {
            cookiesToSet.push({ name, value, options: options ?? {} });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    const url = new URL("/login", siteOrigin);
    url.searchParams.set("error", "oauth_start_failed");
    return NextResponse.redirect(url.toString(), { headers: rate.headers });
  }

  // Redirect to Google with the code_verifier cookie set server-side.
  const response = NextResponse.redirect(data.url, { headers: rate.headers });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
