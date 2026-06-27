import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockRecomputeVenueSignal = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();
const mockGetAuthenticatedUserId = vi.fn();
const mockCheckFirstReportOfNight = vi.fn();
const mockCheckStreakBonus = vi.fn();
const mockGetUserScore = vi.fn();
const mockRefreshStreakCount = vi.fn();
const mockUpdateUserScore = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} - add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: { from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser } },
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthenticatedUserId: mockGetAuthenticatedUserId,
}));

vi.mock("@/lib/signals", () => ({
  recomputeVenueSignal: mockRecomputeVenueSignal,
}));

vi.mock("@/lib/rewards", () => ({
  checkFirstReportOfNight: mockCheckFirstReportOfNight,
  checkStreakBonus: mockCheckStreakBonus,
  getUserScore: mockGetUserScore,
  refreshStreakCount: mockRefreshStreakCount,
  updateUserScore: mockUpdateUserScore,
}));

function request(venueId: string) {
  return new NextRequest("http://localhost/api/check-ins", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.44",
    },
    body: JSON.stringify({
      venueId,
      busyness: "packed",
      crowdFeel: "balanced",
    }),
  });
}

function chain(resolved: { data?: unknown; error?: unknown; count?: number }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
    count: resolved.count,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
    maybeSingle: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

function venue(id: string) {
  return {
    id,
    place_id: `place-${id}`,
    hidden: false,
  };
}

function checkIn(venueId: string) {
  return {
    id: `check-in-${venueId}`,
    venue_id: venueId,
    place_id: `place-${venueId}`,
    busyness: "packed",
    crowd_feel: "balanced",
    note: null,
    created_at: "2026-06-27T10:15:00.000Z",
  };
}

function enqueueSuccessfulCheckIn(venueId: string) {
  mockFrom
    .mockReturnValueOnce(chain({ data: venue(venueId) }))
    .mockReturnValueOnce(chain({ data: [] }))
    .mockReturnValueOnce(chain({ data: { gender: "female" } }))
    .mockReturnValueOnce(chain({ data: checkIn(venueId) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T10:15:00.000Z"));
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockGetAuthenticatedUserId.mockResolvedValue("user-123");
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockRecomputeVenueSignal.mockResolvedValue(null);
  mockCheckFirstReportOfNight.mockResolvedValue(false);
  mockCheckStreakBonus.mockResolvedValue(false);
  mockGetUserScore.mockResolvedValue({ points_total: 5, level: "newcomer" });
  mockRefreshStreakCount.mockResolvedValue(1);
  mockUpdateUserScore.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/check-ins rate limit", () => {
  it("returns 429 on the 4th check-in in the same hour window", async () => {
    enqueueSuccessfulCheckIn("venue-1");
    enqueueSuccessfulCheckIn("venue-2");
    enqueueSuccessfulCheckIn("venue-3");

    const { POST } = await import("../check-ins/route");

    for (const venueId of ["venue-1", "venue-2", "venue-3"]) {
      const res = await POST(request(venueId));
      expect(res.status).toBe(201);
    }

    const res = await POST(request("venue-4"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("2700");
    await expect(res.json()).resolves.toEqual({
      error: "Check-in limit reached. Try again later.",
    });
  });

  it("sets Retry-After to a positive integer for a limited check-in", async () => {
    enqueueSuccessfulCheckIn("venue-1");
    enqueueSuccessfulCheckIn("venue-2");
    enqueueSuccessfulCheckIn("venue-3");

    const { POST } = await import("../check-ins/route");

    for (const venueId of ["venue-1", "venue-2", "venue-3"]) {
      const res = await POST(request(venueId));
      expect(res.status).toBe(201);
    }

    const res = await POST(request("venue-4"));
    const retryAfter = res.headers.get("Retry-After");

    expect(res.status).toBe(429);
    expect(retryAfter).toMatch(/^[1-9]\d*$/);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("keeps different users in separate check-in rate limit buckets", async () => {
    enqueueSuccessfulCheckIn("venue-1");
    enqueueSuccessfulCheckIn("venue-2");
    enqueueSuccessfulCheckIn("venue-3");
    enqueueSuccessfulCheckIn("venue-4");

    const { POST } = await import("../check-ins/route");

    mockGetAuthenticatedUserId.mockResolvedValue("user-123");
    for (const venueId of ["venue-1", "venue-2", "venue-3"]) {
      const res = await POST(request(venueId));
      expect(res.status).toBe(201);
    }

    mockGetAuthenticatedUserId.mockResolvedValue("user-456");
    const otherUserRes = await POST(request("venue-4"));
    expect(otherUserRes.status).toBe(201);

    mockGetAuthenticatedUserId.mockResolvedValue("user-123");
    const limitedRes = await POST(request("venue-5"));
    expect(limitedRes.status).toBe(429);
    await expect(limitedRes.json()).resolves.toEqual({
      error: "Check-in limit reached. Try again later.",
    });
  });

  it("allows check-ins again after the hourly window resets", async () => {
    enqueueSuccessfulCheckIn("venue-1");
    enqueueSuccessfulCheckIn("venue-2");
    enqueueSuccessfulCheckIn("venue-3");
    enqueueSuccessfulCheckIn("venue-4");

    const { POST } = await import("../check-ins/route");

    for (const venueId of ["venue-1", "venue-2", "venue-3"]) {
      const res = await POST(request(venueId));
      expect(res.status).toBe(201);
    }

    const limitedRes = await POST(request("venue-4-before-reset"));
    expect(limitedRes.status).toBe(429);

    vi.setSystemTime(new Date("2026-06-27T11:00:01.000Z"));

    const resetRes = await POST(request("venue-4"));
    expect(resetRes.status).toBe(201);
  });
});
