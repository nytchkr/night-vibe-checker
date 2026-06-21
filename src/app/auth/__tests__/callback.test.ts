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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockExchangeCodeForSession.mockResolvedValue({
    data: { session: { user: { id: "user-123" } } },
    error: null,
  });
  mockEq.mockResolvedValue({ count: 1, error: null });
});

describe("GET /auth/callback", () => {
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
