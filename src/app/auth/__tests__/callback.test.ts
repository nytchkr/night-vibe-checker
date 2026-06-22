import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockExchangeCodeForSession = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function callbackRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function callbackRequestWithCookies(path: string, cookies: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockExchangeCodeForSession.mockResolvedValue({
    data: { session: { user: { id: "user-123" } } },
    error: null,
  });
  mockEq.mockResolvedValue({ count: 1, error: null });
});

describe("GET /auth/callback", () => {
  it("restarts Google OAuth once when the PKCE exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: "AuthApiError", message: "invalid flow state", code: "flow_state_not_found", status: 404 },
    });

    const { GET } = await import("../callback/route");
    const res = await GET(callbackRequest("/auth/callback?code=auth-code&return=%2Fexplore"));

    expect(res.headers.get("location")).toBe("http://localhost/api/auth/google?return=%2Fexplore");
    expect(res.cookies.get("nytchkr-auth-retry")?.value).toBe("1");
  });

  it("shows the auth failure after the one-time retry has already happened", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: "AuthApiError", message: "invalid flow state", code: "flow_state_not_found", status: 404 },
    });

    const { GET } = await import("../callback/route");
    const res = await GET(
      callbackRequestWithCookies("/auth/callback?code=auth-code&return=%2Fexplore", {
        "nytchkr-auth-retry": "1",
      })
    );

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=auth_failed&message=Could+not+finish+sign-in.+Please+try+again."
    );
    expect(res.cookies.get("nytchkr-auth-retry")?.value).toBe("");
  });

  it("redirects users with no check-ins to the profile welcome state", async () => {
    mockEq.mockResolvedValue({ count: 0, error: null });

    const { GET } = await import("../callback/route");
    const res = await GET(callbackRequest("/auth/callback?code=auth-code&return=%2Fexplore"));

    expect(res.headers.get("location")).toBe("http://localhost/profile?welcome=1");
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    expect(mockSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("uses the return URL for users with existing check-ins", async () => {
    mockEq.mockResolvedValue({ count: 2, error: null });

    const { GET } = await import("../callback/route");
    const res = await GET(callbackRequest("/auth/callback?code=auth-code&return=%2Fexplore"));

    expect(res.headers.get("location")).toBe("http://localhost/explore");
  });

  it("falls back to the return URL when the check-in count query fails", async () => {
    mockEq.mockResolvedValue({ count: null, error: { message: "count unavailable" } });

    const { GET } = await import("../callback/route");
    const res = await GET(callbackRequest("/auth/callback?code=auth-code&return=%2Fexplore"));

    expect(res.headers.get("location")).toBe("http://localhost/explore");
  });
});
