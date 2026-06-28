import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

function params(zoneId: string) {
  return { params: Promise.resolve({ zoneId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/zones/[zoneId]/stats", () => {
  it("returns correct live count and venue count for a valid zone", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([
        { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
        { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
        { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
      ])
      .mockResolvedValueOnce([{ count: 12 }]);

    const { GET } = await import("../zones/[zoneId]/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/zones/south-end-charlotte/stats"), params("south-end-charlotte"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=60");
    expect(json).toEqual({
      zoneId: "south-end-charlotte",
      liveCheckInCount: 3,
      topVenueId: "venue-a",
      topVenueName: "Alpha",
      venueCount: 12,
    });
    expect(mockSql).toHaveBeenCalledTimes(3);
  });

  it("returns 400 for invalid zoneId", async () => {
    const { GET } = await import("../zones/[zoneId]/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/zones/fake-zone/stats"), params("fake-zone"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).toEqual({ error: "Unknown zoneId." });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns zero live check-ins when the zone has no recent check-ins", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 4 }]);

    const { GET } = await import("../zones/[zoneId]/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/zones/south-park-charlotte/stats"), params("south-park-charlotte"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=60");
    expect(json).toEqual({
      zoneId: "south-park-charlotte",
      liveCheckInCount: 0,
      topVenueId: null,
      topVenueName: null,
      venueCount: 4,
    });
  });

  it("identifies the top venue from recent check-ins", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([
            { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
      ])
      .mockResolvedValueOnce([{ count: 6 }]);

    const { GET } = await import("../zones/[zoneId]/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/zones/dilworth-charlotte/stats"), params("dilworth-charlotte"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.topVenueId).toBe("venue-b");
    expect(json.topVenueName).toBe("Beta");
    expect(json.liveCheckInCount).toBe(4);
    expect(json.venueCount).toBe(6);
  });
});
