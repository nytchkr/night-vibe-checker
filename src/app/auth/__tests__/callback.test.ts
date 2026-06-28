import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function callbackRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /auth/callback", () => {
  it("redirects legacy Supabase callback traffic to the NextAuth sign-in page", async () => {
    const { GET } = await import("../callback/route");
    const res = await GET(callbackRequest("/auth/callback?code=auth-code&return=%2Fexplore"));

    expect(res.headers.get("location")).toBe("http://localhost/sign-in");
  });
});
