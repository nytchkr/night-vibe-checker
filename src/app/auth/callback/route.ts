import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

const AUTH_RETRY_COOKIE = "nytchkr-auth-retry";

function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/map";
  }
  return value;
}

function authFailedUrl(origin: string, message: string): string {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_failed");
  url.searchParams.set("message", message);
  return url.toString();
}

function getProjectRef(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const host = new URL(supabaseUrl).hostname;
    const [projectRef] = host.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

function clearPkceVerifierCookie(response: NextResponse) {
  const projectRef = getProjectRef();
  if (!projectRef) return;

  response.cookies.set(`sb-${projectRef}-auth-token-code-verifier`, "", {
    path: "/",
    maxAge: 0,
  });
}

function retryGoogleOAuth(origin: string, returnUrl: string): NextResponse {
  const retryUrl = new URL("/api/auth/google", origin);
  retryUrl.searchParams.set("return", returnUrl);

  const response = NextResponse.redirect(retryUrl);
  response.cookies.set(AUTH_RETRY_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60,
  });
  clearPkceVerifierCookie(response);
  return response;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawReturnUrl = searchParams.get("return");
  const returnUrl = safeReturnUrl(rawReturnUrl);
  const redirectUrl = `${origin}${returnUrl}`;

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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Supabase OAuth callback exchange failed", {
        name: error.name,
        message: error.message,
        code: "code" in error ? error.code : undefined,
        status: "status" in error ? error.status : undefined,
      });

      if (req.cookies.get(AUTH_RETRY_COOKIE)?.value !== "1") {
        return retryGoogleOAuth(origin, returnUrl);
      }

      const failureResponse = NextResponse.redirect(
        authFailedUrl(origin, "Could not finish sign-in. Please try again.")
      );
      clearPkceVerifierCookie(failureResponse);
      failureResponse.cookies.set(AUTH_RETRY_COOKIE, "", { path: "/", maxAge: 0 });
      return failureResponse;
    }

    response.cookies.set(AUTH_RETRY_COOKIE, "", { path: "/", maxAge: 0 });

    const userId = data.session?.user.id;
    if (userId) {
      const { count, error: countError } = await supabaseAdmin
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!countError && count === 0) {
        response.headers.set("Location", `${origin}/profile?welcome=1`);
      }
    }

    return response;
  }

  return NextResponse.redirect(`${origin}${returnUrl}`);
}
