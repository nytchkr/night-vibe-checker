import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  contentSecurityPolicy,
  isProtectedApiRequest,
  isProtectedPageRoute,
  middleware,
} from "@/middleware";

function request(method: string, pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("middleware route protection", () => {
  it("builds a nonce-based CSP with trusted script domains only", () => {
    const csp = contentSecurityPolicy("test-nonce");
    const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src"));

    expect(scriptSrc).toBe("script-src 'self' 'nonce-test-nonce' https://maps.googleapis.com https://va.vercel-scripts.com");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds a fresh nonce CSP header to middleware responses", async () => {
    const firstResponse = await middleware(new NextRequest("https://nytchkr.com/map"));
    const secondResponse = await middleware(new NextRequest("https://nytchkr.com/map"));
    const firstCsp = firstResponse.headers.get("content-security-policy");
    const secondCsp = secondResponse.headers.get("content-security-policy");

    expect(firstCsp).toMatch(/script-src 'self' 'nonce-[^']+' https:\/\/maps\.googleapis\.com https:\/\/va\.vercel-scripts\.com/);
    expect(secondCsp).toMatch(/script-src 'self' 'nonce-[^']+' https:\/\/maps\.googleapis\.com https:\/\/va\.vercel-scripts\.com/);
    expect(firstCsp).not.toBe(secondCsp);
  });

  it("protects authenticated-only page routes and nested paths", () => {
    expect(isProtectedPageRoute("/vibe-check")).toBe(true);
    expect(isProtectedPageRoute("/vibe-check/history")).toBe(true);
    expect(isProtectedPageRoute("/notifications")).toBe(true);
    expect(isProtectedPageRoute("/notifications/settings")).toBe(true);
  });

  it("leaves public page routes open", () => {
    expect(isProtectedPageRoute("/")).toBe(false);
    expect(isProtectedPageRoute("/map")).toBe(false);
    expect(isProtectedPageRoute("/explore")).toBe(false);
    expect(isProtectedPageRoute("/profile")).toBe(false);
    expect(isProtectedPageRoute("/profile/settings")).toBe(false);
    expect(isProtectedPageRoute("/venues/venue-1")).toBe(false);
    expect(isProtectedPageRoute("/login")).toBe(false);
    expect(isProtectedPageRoute("/auth/callback")).toBe(false);
    expect(isProtectedPageRoute("/widget/venue-1")).toBe(false);
  });

  it("protects only POST requests for write APIs", () => {
    expect(isProtectedApiRequest(request("POST", "/api/check-ins"))).toBe(true);
    expect(isProtectedApiRequest(request("POST", "/api/ratings"))).toBe(true);
    expect(isProtectedApiRequest(request("POST", "/api/venue-ratings"))).toBe(true);
    expect(isProtectedApiRequest(request("POST", "/api/push/subscribe"))).toBe(true);
    expect(isProtectedApiRequest(request("GET", "/api/check-ins"))).toBe(false);
    expect(isProtectedApiRequest(request("GET", "/api/venue-ratings"))).toBe(false);
    expect(isProtectedApiRequest(request("GET", "/api/venues"))).toBe(false);
    expect(isProtectedApiRequest(request("POST", "/api/widget/venue-1"))).toBe(false);
  });

  it("redirects share target POST requests to the share confirmation page", async () => {
    const body = new URLSearchParams({
      title: "Tonight",
      text: "Try this spot",
      url: "https://nytchkr.com/map",
    });
    const response = await middleware(
      new NextRequest("http://localhost/share", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/share?title=Tonight&text=Try+this+spot&url=https%3A%2F%2Fnytchkr.com%2Fmap",
    );
  });

  it("redirects legacy Vercel auth callbacks to the canonical domain", async () => {
    const response = await middleware(
      new NextRequest("https://night-vibe-checker.vercel.app/auth/callback?code=abc123&return=%2Fprofile"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://nytchkr.com/auth/callback?code=abc123&return=%2Fprofile",
    );
  });

  it("moves root auth code redirects to the canonical callback route", async () => {
    const legacyResponse = await middleware(
      new NextRequest("https://night-vibe-checker.vercel.app/?code=abc123"),
    );
    const canonicalResponse = await middleware(
      new NextRequest("https://nytchkr.com/?code=abc123"),
    );

    expect(legacyResponse.status).toBe(308);
    expect(legacyResponse.headers.get("location")).toBe(
      "https://nytchkr.com/auth/callback?code=abc123",
    );
    expect(canonicalResponse.status).toBe(308);
    expect(canonicalResponse.headers.get("location")).toBe(
      "https://nytchkr.com/auth/callback?code=abc123",
    );
  });
});
