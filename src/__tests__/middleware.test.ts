import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  contentSecurityPolicy,
  isProtectedApiRequest,
  isProtectedPageRoute,
  middleware,
} from "@/middleware";

// NextAuth auth() middleware returns void for allowed requests in test env
vi.mock("@/auth", () => ({
  auth: (handler: (req: NextRequest) => unknown) => handler,
}));

function request(method: string, pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

async function callMiddleware(req: NextRequest) {
  const res = await middleware(req, undefined as never);
  return res ?? { status: 200, headers: new Headers() };
}

describe("middleware route protection", () => {
  it("builds a nonce-based CSP with trusted script domains only", () => {
    const csp = contentSecurityPolicy("test-nonce");
    const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src"));

    expect(scriptSrc).toBe(
      "script-src 'self' 'nonce-test-nonce' https://maps.googleapis.com https://va.vercel-scripts.com"
    );
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("can omit HTTPS upgrade directives for local HTTP test servers", () => {
    const csp = contentSecurityPolicy("test-nonce", { upgradeInsecureRequests: false });
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("adds a fresh nonce CSP header to middleware responses", async () => {
    const firstResponse = await callMiddleware(new NextRequest("https://nytchkr.com/map"));
    const secondResponse = await callMiddleware(new NextRequest("https://nytchkr.com/map"));
    const firstCsp = firstResponse.headers.get("content-security-policy");
    const secondCsp = secondResponse.headers.get("content-security-policy");

    expect(firstCsp).toMatch(
      /script-src 'self' 'nonce-[^']+' https:\/\/maps\.googleapis\.com https:\/\/va\.vercel-scripts\.com/
    );
    expect(secondCsp).toMatch(
      /script-src 'self' 'nonce-[^']+' https:\/\/maps\.googleapis\.com https:\/\/va\.vercel-scripts\.com/
    );
    expect(firstCsp).not.toBe(secondCsp);
  });

  it("canonicalizes production aliases before auth routes can generate callbacks", async () => {
    for (const host of [
      "www.nytchkr.com",
      "night-vibe-checker.vercel.app",
      "calm-pond-08a894f0f.7.azurestaticapps.net",
    ]) {
      const response = await callMiddleware(
        new NextRequest(`https://${host}/api/auth/signin/google?callbackUrl=%2Fexplore`)
      );

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://nytchkr.com/api/auth/signin/google?callbackUrl=%2Fexplore"
      );
    }
  });

  it("protects authenticated-only page routes and nested paths", () => {
    expect(isProtectedPageRoute("/admin")).toBe(true);
    expect(isProtectedPageRoute("/admin/dashboard")).toBe(true);
    expect(isProtectedPageRoute("/profile")).toBe(true);
  });

  it("leaves public page routes open", () => {
    expect(isProtectedPageRoute("/")).toBe(false);
    expect(isProtectedPageRoute("/map")).toBe(false);
    expect(isProtectedPageRoute("/explore")).toBe(false);
    expect(isProtectedPageRoute("/venues/venue-1")).toBe(false);
    expect(isProtectedPageRoute("/sign-in")).toBe(false);
  });

  it("protects only POST requests for write APIs", () => {
    expect(isProtectedApiRequest(request("POST", "/api/ratings"))).toBe(true);
    expect(isProtectedApiRequest(request("GET", "/api/venues"))).toBe(false);
    expect(isProtectedApiRequest(request("POST", "/api/venues"))).toBe(false);
  });

  it("does not special-case removed standalone share page requests", async () => {
    const response = await callMiddleware(new NextRequest("http://localhost/share", { method: "POST" }));
    expect(response.status).toBe(200);
  });
});
