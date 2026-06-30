import { auth } from "@/auth";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const PROTECTED_PAGE_ROUTES = ["/admin", "/profile", "/saved"] as const;
const PROTECTED_API_ROUTES = [
  "/api/ratings",
  "/api/venue-ratings",
  "/api/push/subscribe",
  "/api/push/venue-alert",
] as const;
const CANONICAL_HOST = "nytchkr.com";
const CANONICAL_REDIRECT_HOSTS = new Set([
  "www.nytchkr.com",
  "night-vibe-checker.vercel.app",
  "calm-pond-08a894f0f.7.azurestaticapps.net",
]);
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

function createNonce(): string {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  let binary = "";
  nonceBytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function contentSecurityPolicy(nonce: string, { upgradeInsecureRequests = true }: { upgradeInsecureRequests?: boolean } = {}): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://maps.googleapis.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.googleapis.com",
    "img-src 'self' data: blob: https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com https://*.gstatic.com https://*.googleusercontent.com https://storage.googleapis.com https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://besttime.app https://vitals.vercel-insights.com https://*.vercel-insights.com",
    "frame-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
  ];

  if (upgradeInsecureRequests) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function applySecurityHeaders(response: MiddlewareResponse, nonce: string, upgradeInsecureRequests = true): MiddlewareResponse {
  response.headers.set(CSP_HEADER, contentSecurityPolicy(nonce, { upgradeInsecureRequests }));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=()");
  return response;
}

function withSecurityHeaders(response: MiddlewareResponse, nonce: string): MiddlewareResponse {
  return applySecurityHeaders(response, nonce);
}

function shouldUpgradeInsecureRequests(req: NextRequest): boolean {
  return !["localhost", "127.0.0.1", "0.0.0.0"].includes(req.nextUrl.hostname);
}

function loginRedirect(req: NextRequest, nonce: string): MiddlewareResponse {
  const redirectUrl = req.nextUrl.clone();
  const returnPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  redirectUrl.pathname = "/sign-in";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("return", returnPath);

  return withSecurityHeaders(NextResponse.redirect(redirectUrl), nonce);
}

function unauthorized(nonce: string): MiddlewareResponse {
  return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), nonce);
}

async function handleMiddleware(req: NextRequest & { auth?: unknown }): Promise<MiddlewareResponse> {
  const nonce = createNonce();
  const upgradeInsecureRequests = shouldUpgradeInsecureRequests(req);

  if (CANONICAL_REDIRECT_HOSTS.has(req.nextUrl.hostname)) {
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
  applySecurityHeaders(response, nonce, upgradeInsecureRequests);

  if (req.auth) return response;
  if (isProtectedApiRequest(req)) return unauthorized(nonce);
  if (isProtectedPageRoute(req.nextUrl.pathname)) return loginRedirect(req, nonce);

  return response;
}

const authMiddleware = auth(handleMiddleware);

export function middleware(req: NextRequest, ctx?: NextFetchEvent): Promise<MiddlewareResponse> {
  return (authMiddleware as unknown as (request: NextRequest, event?: NextFetchEvent) => Promise<MiddlewareResponse>)(req, ctx);
}

export default middleware;

export const config = {
  matcher: [
    "/((?!\\.swa|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
