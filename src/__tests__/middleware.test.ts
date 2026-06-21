import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isProtectedApiRequest, isProtectedPageRoute } from "@/middleware";

function request(method: string, pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("middleware route protection", () => {
  it("protects authenticated-only page routes and nested paths", () => {
    expect(isProtectedPageRoute("/vibe-check")).toBe(true);
    expect(isProtectedPageRoute("/vibe-check/history")).toBe(true);
    expect(isProtectedPageRoute("/profile")).toBe(true);
    expect(isProtectedPageRoute("/profile/settings")).toBe(true);
  });

  it("leaves public page routes open", () => {
    expect(isProtectedPageRoute("/")).toBe(false);
    expect(isProtectedPageRoute("/map")).toBe(false);
    expect(isProtectedPageRoute("/explore")).toBe(false);
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
});
