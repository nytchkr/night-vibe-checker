import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();
const mockCalculateUserStreak = vi.fn();

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

vi.mock("@/app/api/user/streak/route", () => ({
  calculateUserStreak: mockCalculateUserStreak,
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
  mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null }));
  mockCalculateUserStreak.mockReturnValue({ streak: 0, lastCheckinDate: null });
});

describe("GET /api/user/profile", () => {
  it("returns 401 when no Bearer token is provided", async () => {
    const { GET } = await import("../user/profile/route");
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    await expect(res.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mockAdminGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns zeroed stats for a new user", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockAdminGetUser).toHaveBeenCalledWith("token");
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    await expect(res.json()).resolves.toEqual({
      userId: "user-123",
      totalCheckIns: 0,
      uniqueVenues: 0,
      streak: 0,
      topVenues: [],
    });
  });

  it("returns the correct totalCheckIns count", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const query = checkInsQuery({
      data: [
        checkIn("venue-1", "Trio"),
        checkIn("venue-2", "Lost and Found"),
        checkIn("venue-1", "Trio"),
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(query.select).toHaveBeenCalledWith("venue_id,created_at,venues(name)");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-123");
    expect(query.eq).toHaveBeenNthCalledWith(2, "hidden", false);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    await expect(res.json()).resolves.toMatchObject({ totalCheckIns: 3 });
  });

  it("returns the correct uniqueVenues count with deduped venue_ids", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        checkIn("venue-1", "Trio"),
        checkIn("venue-2", "Lost and Found"),
        checkIn("venue-1", "Trio"),
        checkIn(null, null),
      ],
      error: null,
    }));

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ uniqueVenues: 2 });
  });

  it("returns topVenues sorted by check-in count descending, max 3", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        checkIn("venue-1", "Trio"),
        checkIn("venue-2", "Lost and Found"),
        checkIn("venue-1", "Trio"),
        checkIn("venue-3", "Pins"),
        checkIn("venue-2", "Lost and Found"),
        checkIn("venue-1", "Trio"),
        checkIn("venue-4", "Elsewhere"),
      ],
      error: null,
    }));

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      topVenues: [
        { venueId: "venue-1", venueName: "Trio", checkIns: 3 },
        { venueId: "venue-2", venueName: "Lost and Found", checkIns: 2 },
        { venueId: "venue-3", venueName: "Pins", checkIns: 1 },
      ],
    });
  });

  it("returns the user's current streak from calculateUserStreak", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockCalculateUserStreak.mockReturnValue({ streak: 4, lastCheckinDate: "2026-06-27" });
    mockFrom.mockReturnValue(checkInsQuery({
      data: [
        checkIn("venue-1", "Trio", "2026-06-27T23:30:00.000Z"),
        checkIn("venue-2", "Lost and Found", "2026-06-26T23:30:00.000Z"),
      ],
      error: null,
    }));

    const { GET } = await import("../user/profile/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockCalculateUserStreak).toHaveBeenCalledWith([
      { created_at: "2026-06-27T23:30:00.000Z" },
      { created_at: "2026-06-26T23:30:00.000Z" },
    ]);
    await expect(res.json()).resolves.toMatchObject({ streak: 4 });
  });
});

function checkInsQuery(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnValue(promise),
  };

  return query;
}

function checkIn(venueId: string | null, venueName: string | null, createdAt = "2026-06-27T10:00:00.000Z") {
  return {
    venue_id: venueId,
    created_at: createdAt,
    venues: venueName ? { name: venueName } : null,
  };
}
