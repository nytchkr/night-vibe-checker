import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PAGE_ROUTES = ["/admin", "/vibe-check", "/notifications"] as const;
const PROTECTED_API_ROUTES = [
  "/api/check-ins",
  "/api/ratings",
  "/api/venue-ratings",
  "/api/push/subscribe",
  "/api/push/venue-alert",
] as const;
const LEGACY_HOSTS = new Set(["night-vibe-checker.vercel.app"]);
const CANONICAL_HOST = "nytchkr.com";

type MiddlewareResponse = NextResponse<unknown>;

function isRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isProtectedPageRoute(pathname: string): boolean {
  return PROTECTED_PAGE_ROUTES.some((route) => isRouteOrChild(pathname, route));
}

export function isProtectedApiRequest(req: NextRequest): boolean {
  if (req.method !== "POST") return false;
  return PROTECTED_API_ROUTES.some((route) => isRouteOrChild(req.nextUrl.pathname, route));
}

function applySessionCookies(source: MiddlewareResponse, target: MiddlewareResponse): MiddlewareResponse {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

function loginRedirect(req: NextRequest, sessionResponse: MiddlewareResponse): MiddlewareResponse {
  const redirectUrl = req.nextUrl.clone();
  const returnPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("return", returnPath);

  return applySessionCookies(sessionResponse, NextResponse.redirect(redirectUrl));
}

function unauthorized(sessionResponse: MiddlewareResponse): MiddlewareResponse {
  return applySessionCookies(
    sessionResponse,
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

async function shareRedirect(req: NextRequest): Promise<MiddlewareResponse> {
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.search = "";

  try {
    const formData = await req.formData();
    for (const key of ["title", "text", "url"]) {
      const value = formData.get(key);
      if (typeof value === "string" && value) {
        redirectUrl.searchParams.set(key, value);
      }
    }
  } catch {
    redirectUrl.search = "";
  }

  return NextResponse.redirect(redirectUrl, 303);
}

function rootAuthCodeRedirect(req: NextRequest): MiddlewareResponse | null {
  if (req.nextUrl.pathname !== "/" || !req.nextUrl.searchParams.has("code")) {
    return null;
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.port = "";
  redirectUrl.pathname = "/auth/callback";
  return NextResponse.redirect(redirectUrl, 308);
}

export async function middleware(req: NextRequest): Promise<MiddlewareResponse> {
  const authCodeRedirect = rootAuthCodeRedirect(req);
  if (authCodeRedirect) return authCodeRedirect;

  if (LEGACY_HOSTS.has(req.nextUrl.hostname)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.protocol = "https:";
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, 308);
  }

  const requestHeaders = new Headers(req.headers);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (req.nextUrl.pathname === "/share" && req.method === "POST") {
    return shareRedirect(req);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });
        requestHeaders.set("cookie", req.cookies.toString());
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return response;
  if (isProtectedApiRequest(req)) return unauthorized(response);
  if (isProtectedPageRoute(req.nextUrl.pathname)) return loginRedirect(req, response);

  return response;
}

export const config = {
  matcher: [
    "/((?!\\.swa|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
