import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSignInWithOtp = vi.fn();
const mockCreateClient = vi.fn(() => ({
  auth: { signInWithOtp: mockSignInWithOtp },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
});

describe("POST /api/auth/magic-link", () => {
  it("validates the email payload", async () => {
    const { POST } = await import("../auth/magic-link/route");
    const res = await POST(request({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("sends a magic link with a safe callback return URL", async () => {
    const { POST } = await import("../auth/magic-link/route");
    const res = await POST(request({ email: "USER@Example.COM", returnTo: "/venues/abc" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.ok).toBe(true);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://supabase.example.test",
      "anon-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: "http://localhost/auth/callback?return=%2Fvenues%2Fabc" },
    });
  });

  it("rate limits magic link requests per normalized email", async () => {
    const { POST } = await import("../auth/magic-link/route");

    for (let i = 0; i < 3; i += 1) {
      const res = await POST(request({ email: "User@example.com" }));
      expect(res.status).toBe(200);
    }

    const res = await POST(request({ email: "user@EXAMPLE.com" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(mockSignInWithOtp).toHaveBeenCalledTimes(3);
  });
});
