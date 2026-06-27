import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} - add to .env.local`);
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
  return new NextRequest("http://localhost/api/user/profile", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockFrom.mockImplementation(() => checkInsQuery({ data: [], error: null, count: 0 }));
});

describe("GET /api/user/profile", () => {
  it("returns 401 without a valid bearer token", async () => {
    const { GET } = await import("../user/profile/route");
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's activity summary", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const totalQuery = checkInsQuery({ data: null, error: null, count: 6 });
    const streakQuery = checkInsQuery({
      data: [
        { created_at: new Date().toISOString() },
        { created_at: dateDaysAgo(1) },
      ],
      error: null,
      count: null,
    });
    const venuesQuery = checkInsQuery({
      data: [
        { venue_id: "venue-1", venues: { name: "Trio" } },
        { venue_id: "venue-2", venues: { name: "Slate" } },
        { venue_id: "venue-1", venues: { name: "Trio" } },
        { venue_id: "venue-3", venues: [{ name: "Lost & Found" }] },
        { venue_id: "venue-1", venues: { name: "Trio" } },
        { venue_id: "venue-4", venues: { name: "Vinyl" } },
        { venue_id: null, venues: null },
      ],
      error: null,
      count: null,
    });
    mockFrom
      .mockReturnValueOnce(totalQuery)
      .mockReturnValueOnce(streakQuery)
      .mockReturnValueOnce(venuesQuery);

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockAdminGetUser).toHaveBeenCalledWith("token");
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(totalQuery.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(streakQuery.select).toHaveBeenCalledWith("created_at");
    expect(streakQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(venuesQuery.select).toHaveBeenCalledWith("venue_id,venues(name)");

    for (const query of [totalQuery, streakQuery, venuesQuery]) {
      expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-123");
      expect(query.eq).toHaveBeenNthCalledWith(2, "hidden", false);
    }

    await expect(res.json()).resolves.toEqual({
      userId: "user-123",
      totalCheckIns: 6,
      uniqueVenues: 4,
      streak: 2,
      topVenues: [
        { venueId: "venue-1", venueName: "Trio", checkInCount: 3 },
        { venueId: "venue-3", venueName: "Lost & Found", checkInCount: 1 },
        { venueId: "venue-2", venueName: "Slate", checkInCount: 1 },
      ],
    });
  });

  it("returns an empty summary for users with no check-ins", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-empty" } }, error: null });

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      userId: "user-empty",
      totalCheckIns: 0,
      uniqueVenues: 0,
      streak: 0,
      topVenues: [],
    });
  });

  it("returns 500 when any summary query fails", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom
      .mockReturnValueOnce(checkInsQuery({ data: null, error: null, count: 0 }))
      .mockReturnValueOnce(checkInsQuery({ data: null, error: { message: "query failed" }, count: null }))
      .mockReturnValueOnce(checkInsQuery({ data: [], error: null, count: null }));

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Could not fetch profile summary." });
  });
});

function checkInsQuery(result: { data: unknown; error: unknown; count: number | null }) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
  };

  return query;
}

function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}
