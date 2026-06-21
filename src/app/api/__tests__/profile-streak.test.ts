import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCookieGetUser = vi.fn();
const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
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
    from: mockFrom,
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
  mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null, count: 0 }));
});

describe("GET /api/profile/streak", () => {
  it("returns 401 without an authenticated user", async () => {
    const { GET } = await import("../profile/streak/route");
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the user's current streak, longest streak, and check-in total", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        { created_at: new Date().toISOString() },
        { created_at: dateDaysAgo(1) },
        { created_at: dateDaysAgo(2) },
        { created_at: dateDaysAgo(5) },
        { created_at: dateDaysAgo(6) },
      ],
      error: null,
      count: 5,
    }));

    const { GET } = await import("../profile/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    await expect(res.json()).resolves.toEqual({
      currentStreak: 3,
      longestStreak: 3,
      totalCheckIns: 5,
    });
  });

  it("returns a zero current streak when the user has not checked in today", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        { created_at: dateDaysAgo(2) },
        { created_at: dateDaysAgo(3) },
      ],
      error: null,
      count: 2,
    }));

    const { GET } = await import("../profile/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      currentStreak: 0,
      longestStreak: 2,
      totalCheckIns: 2,
    });
  });

  it("returns 500 when the check-in query fails", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({ data: null, error: { message: "query failed" }, count: null }));

    const { GET } = await import("../profile/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(500);
  });
});

function checkInsQuery(result: { data: unknown; error: unknown; count: number | null }) {
  const query: {
    select: () => typeof query;
    eq: () => typeof query;
    order: () => Promise<typeof result>;
  } = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve(result),
  };

  return query;
}

function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}
