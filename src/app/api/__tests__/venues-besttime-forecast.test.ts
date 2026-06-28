import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindVisibleVenueByIdOrPlaceId = vi.fn();
const mockFetchBestTimeDayRawForecast = vi.fn();
const mockFetchBestTimeWeekRawForecast = vi.fn();
const mockAuth = vi.hoisted(() => vi.fn());
const mockIsProUser = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("@/lib/venueLookup", () => ({
  findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
  normalizeVenueLookupId: (value: string | null | undefined) => value?.trim() ?? "",
}));

vi.mock("@/lib/besttime", () => ({
  fetchBestTimeDayRawForecast: mockFetchBestTimeDayRawForecast,
  fetchBestTimeWeekRawForecast: mockFetchBestTimeWeekRawForecast,
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/isPro", () => ({
  isProUser: mockIsProUser,
}));

vi.mock("@/lib/upstashRateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetMs: 60_000 }),
  rateLimitHeaders: () => ({}),
}));

vi.mock("@/lib/upstashRedis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

function request(token?: string) {
  return new NextRequest("http://localhost/api/venues/venue-1/besttime-forecast", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function venue() {
  return {
    id: "venue-1",
    name: "Night Spot",
    address: "123 Main St",
    besttime_venue_id: "besttime-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({ data: venue(), error: null });
  mockFetchBestTimeDayRawForecast.mockResolvedValue({
    venueId: "besttime-1",
    dayInt: 4,
    updatedOn: "2026-06-27T20:00:00.000Z",
    hours: [{ hour: 21, busyness: 77 }],
  });
  mockFetchBestTimeWeekRawForecast.mockResolvedValue({
    venueId: "besttime-1",
    updatedOn: "2026-06-27T20:00:00.000Z",
    days: Array.from({ length: 7 }, (_, dayInt) => ({
      venueId: "besttime-1",
      dayInt,
      updatedOn: "2026-06-27T20:00:00.000Z",
      hours: [{ hour: 21, busyness: 70 + dayInt }],
    })),
  });
  mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  mockIsProUser.mockResolvedValue(false);
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
});

describe("GET /api/venues/[id]/besttime-forecast", () => {
  it("returns today's forecast only when there is no bearer token", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const { GET } = await import("../venues/[id]/besttime-forecast/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.hours).toEqual([{ hour: 21, busyness: 77 }]);
    expect(json.data.days).toBeUndefined();
    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockIsProUser).not.toHaveBeenCalled();
    expect(mockFetchBestTimeDayRawForecast).toHaveBeenCalledWith("besttime-1", "Night Spot", "123 Main St");
    expect(mockFetchBestTimeWeekRawForecast).not.toHaveBeenCalled();
  });

  it("returns seven forecast days for active Pro users", async () => {
    mockIsProUser.mockResolvedValue(true);

    const { GET } = await import("../venues/[id]/besttime-forecast/route");
    const res = await GET(request("token-1"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.days).toHaveLength(7);
    expect(json.data.days[6].hours).toEqual([{ hour: 21, busyness: 76 }]);
    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockIsProUser).toHaveBeenCalledWith("user-1");
    expect(mockFetchBestTimeWeekRawForecast).toHaveBeenCalledWith("besttime-1", "Night Spot", "123 Main St");
    expect(mockFetchBestTimeDayRawForecast).not.toHaveBeenCalled();
  });
});
