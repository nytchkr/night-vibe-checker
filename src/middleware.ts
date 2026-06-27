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
const CSP_HEADER = "Content-Security-Policy";
const NONCE_HEADER = "x-nonce";

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

function createNonce(): string {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  let binary = "";
  nonceBytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://maps.googleapis.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com",
    "img-src 'self' data: blob: https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com https://*.gstatic.com https://*.googleusercontent.com https://storage.googleapis.com https://*.supabase.co https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://besttime.app https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.vercel-insights.com",
    "frame-src 'self' https://accounts.google.com https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' https://*.supabase.co",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applySecurityHeaders(response: MiddlewareResponse, nonce: string): MiddlewareResponse {
  response.headers.set(CSP_HEADER, contentSecurityPolicy(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=()");
  return response;
}

function withSecurityHeaders(response: MiddlewareResponse, nonce: string): MiddlewareResponse {
  return applySecurityHeaders(response, nonce);
}

function loginRedirect(req: NextRequest, sessionResponse: MiddlewareResponse, nonce: string): MiddlewareResponse {
  const redirectUrl = req.nextUrl.clone();
  const returnPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("return", returnPath);

  return withSecurityHeaders(applySessionCookies(sessionResponse, NextResponse.redirect(redirectUrl)), nonce);
}

function unauthorized(sessionResponse: MiddlewareResponse, nonce: string): MiddlewareResponse {
  return withSecurityHeaders(
    applySessionCookies(
      sessionResponse,
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    ),
    nonce,
  );
}

async function shareRedirect(req: NextRequest, nonce: string): Promise<MiddlewareResponse> {
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

  return withSecurityHeaders(NextResponse.redirect(redirectUrl, 303), nonce);
}

function rootAuthCodeRedirect(req: NextRequest, nonce: string): MiddlewareResponse | null {
  if (req.nextUrl.pathname !== "/" || !req.nextUrl.searchParams.has("code")) {
    return null;
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = CANONICAL_HOST;
  redirectUrl.port = "";
  redirectUrl.pathname = "/auth/callback";
  return withSecurityHeaders(NextResponse.redirect(redirectUrl, 308), nonce);
}

export async function middleware(req: NextRequest): Promise<MiddlewareResponse> {
  const nonce = createNonce();
  const authCodeRedirect = rootAuthCodeRedirect(req, nonce);
  if (authCodeRedirect) return authCodeRedirect;

  if (LEGACY_HOSTS.has(req.nextUrl.hostname)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.protocol = "https:";
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.port = "";
    return withSecurityHeaders(NextResponse.redirect(redirectUrl, 308), nonce);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  applySecurityHeaders(response, nonce);

  if (req.nextUrl.pathname === "/share" && req.method === "POST") {
    return shareRedirect(req, nonce);
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
        applySecurityHeaders(response, nonce);
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
  if (isProtectedApiRequest(req)) return unauthorized(response, nonce);
  if (isProtectedPageRoute(req.nextUrl.pathname)) return loginRedirect(req, response, nonce);

  return response;
}

export const config = {
  matcher: [
    "/((?!\\.swa|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
