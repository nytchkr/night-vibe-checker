import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCookieGetUser = vi.fn();
const mockAdminGetUser = vi.fn();
const mockRpc = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockCookieGetUser },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: { getUser: mockAdminGetUser },
    rpc: mockRpc,
  },
}));

function request(token?: string) {
  return new NextRequest("http://localhost/api/profile/streak", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockCookieGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no cookie" } });
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockRpc.mockResolvedValue({ data: 0, error: null });
});

describe("GET /api/profile/streak", () => {
  it("returns 401 without an authenticated user", async () => {
    const { GET } = await import("../profile/streak/route");
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns the user's streak from the SQL function", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockRpc.mockResolvedValue({ data: 4, error: null });

    const { GET } = await import("../profile/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("get_user_streak", { user_id: "user-123" });
    await expect(res.json()).resolves.toEqual({ streak: 4 });
  });

  it("returns 500 when the streak function fails", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: "function missing" } });

    const { GET } = await import("../profile/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(500);
  });
});
