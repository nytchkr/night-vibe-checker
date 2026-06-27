import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: { getUser: mockAdminGetUser },
    from: mockFrom,
  },
}));

function request(token?: string) {
  return new NextRequest("http://localhost/api/user/streak", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null }));
});

describe("streak calculation", () => {
  it("counts consecutive ET calendar days ending today and dedupes same-day check-ins", async () => {
    const { calculateUserStreak } = await import("../user/streak/route");
    const now = new Date("2026-06-27T16:00:00.000Z");
    const result = calculateUserStreak(
      [
        { created_at: "2026-06-27T23:30:00.000Z" },
        { created_at: "2026-06-27T04:10:00.000Z" },
        { created_at: "2026-06-26T05:00:00.000Z" },
        { created_at: "2026-06-25T12:00:00.000Z" },
        { created_at: "2026-06-23T12:00:00.000Z" },
      ],
      now,
    );

    expect(result).toEqual({ streak: 3, lastCheckinDate: "2026-06-27" });
  });

  it("returns zero when there is no check-in today in ET", async () => {
    const { calculateUserStreak } = await import("../user/streak/route");
    const now = new Date("2026-06-27T16:00:00.000Z");
    const result = calculateUserStreak(
      [
        { created_at: "2026-06-26T22:00:00.000Z" },
        { created_at: "2026-06-25T22:00:00.000Z" },
      ],
      now,
    );

    expect(result).toEqual({ streak: 0, lastCheckinDate: "2026-06-26" });
  });

  it("converts UTC timestamps to ET calendar dates before counting", async () => {
    const { toEtDateKey } = await import("../user/streak/route");
    expect(toEtDateKey("2026-06-28T03:30:00.000Z")).toBe("2026-06-27");
    expect(toEtDateKey("2026-06-28T04:30:00.000Z")).toBe("2026-06-28");
  });
});

describe("GET /api/user/streak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T16:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns streak=0 for a user with no check-ins", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null }));

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ streak: 0, lastCheckinDate: null });
  });

  it("returns streak=1 for a single check-in today", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [{ created_at: "2026-06-27T23:30:00.000Z" }],
      error: null,
    }));

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ streak: 1, lastCheckinDate: "2026-06-27" });
  });

  it("returns streak=3 for 3 consecutive nights", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        { created_at: "2026-06-27T23:30:00.000Z" },
        { created_at: "2026-06-26T23:30:00.000Z" },
        { created_at: "2026-06-25T23:30:00.000Z" },
      ],
      error: null,
    }));

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ streak: 3, lastCheckinDate: "2026-06-27" });
  });

  it("breaks the streak when yesterday has no check-in", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        { created_at: "2026-06-27T23:30:00.000Z" },
        { created_at: "2026-06-25T23:30:00.000Z" },
        { created_at: "2026-06-24T23:30:00.000Z" },
      ],
      error: null,
    }));

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ streak: 1, lastCheckinDate: "2026-06-27" });
  });

  it("returns 401 without a bearer token", async () => {
    const { GET } = await import("../user/streak/route");
    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's streak summary", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const query = checkInsQuery({
      data: [
        { created_at: new Date().toISOString() },
        { created_at: dateDaysAgo(1) },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    expect(query.select).toHaveBeenCalledWith("created_at");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-123");
    expect(query.eq).toHaveBeenNthCalledWith(2, "hidden", false);
    await expect(res.json()).resolves.toMatchObject({ streak: 2 });
  });

  it("returns 500 when the check-in query fails", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({ data: null, error: { message: "query failed" } }));

    const { GET } = await import("../user/streak/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      status: "error",
      error: { code: "DB_ERROR", message: "Could not fetch streak." },
    });
  });
});

function checkInsQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
  return query;
}

function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}
