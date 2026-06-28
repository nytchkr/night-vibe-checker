import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindVisibleVenueByIdOrPlaceId = vi.fn();
const mockFetchBestTimeDayRawForecast = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("@/lib/venueLookup", async () => {
  return {
    findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
    normalizeVenueLookupId: (value: string | null | undefined) => value?.trim() ?? "",
  };
});

vi.mock("@/lib/besttime", async () => {
  return {
    fetchBestTimeDayRawForecast: mockFetchBestTimeDayRawForecast,
  };
});

vi.mock("@/lib/upstashRedis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

function venue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    name: "Night Spot",
    address: "123 Main St",
    besttime_venue_id: "besttime-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
});

describe("GET /api/venues/[id]/forecast", () => {
  it("returns 24 hourly BestTime busyness bars with CDN cache headers", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({ data: venue(), error: null });
    mockFetchBestTimeDayRawForecast.mockResolvedValue({
      venueId: "besttime-1",
      dayInt: 4,
      updatedOn: "2026-06-27T20:00:00.000Z",
      hours: [
        { hour: 0, busyness: 12.4 },
        { hour: 21, busyness: 76.8 },
      ],
    });

    const { GET } = await import("../venues/[id]/forecast/route");
    const res = await GET(new Request("http://localhost/api/venues/venue-1/forecast"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=3600, stale-while-revalidate=7200");
    expect(json.hours).toHaveLength(24);
    expect(json.hours[0]).toEqual({ hour: 0, busyness: 12 });
    expect(json.hours[20]).toEqual({ hour: 20, busyness: 0 });
    expect(json.hours[21]).toEqual({ hour: 21, busyness: 77 });
    expect(mockFetchBestTimeDayRawForecast).toHaveBeenCalledWith("besttime-1", "Night Spot", "123 Main St");
  });

  it("returns an empty forecast when the venue has no BestTime id", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({
      data: venue({ besttime_venue_id: null }),
      error: null,
    });

    const { GET } = await import("../venues/[id]/forecast/route");
    const res = await GET(new Request("http://localhost/api/venues/venue-1/forecast"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ hours: [] });
    expect(mockFetchBestTimeDayRawForecast).not.toHaveBeenCalled();
  });

  it("returns an empty forecast instead of failing when BestTime errors", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({ data: venue(), error: null });
    mockFetchBestTimeDayRawForecast.mockRejectedValue(new Error("BESTTIME_PRIVATE_KEY is not set."));

    const { GET } = await import("../venues/[id]/forecast/route");
    const res = await GET(new Request("http://localhost/api/venues/venue-1/forecast"), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ hours: [] });
  });
});
