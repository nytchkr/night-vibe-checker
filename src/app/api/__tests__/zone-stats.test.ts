import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function chain(resolved: { data?: unknown; error?: unknown; count?: number | null }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
    count: resolved.count ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

function params(zoneId: string) {
  return { params: Promise.resolve({ zoneId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/zones/[zoneId]/stats", () => {
  it("returns correct live count and venue count for a valid zone", async () => {
    const liveCountChain = chain({ count: 3 });
    const topVenueChain = chain({
      data: [
        { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
        { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
        { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
      ],
    });
    const venueCountChain = chain({ count: 12 });
    mockFrom.mockReturnValueOnce(liveCountChain).mockReturnValueOnce(topVenueChain).mockReturnValueOnce(venueCountChain);

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
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(3, "venues");
    expect(liveCountChain.select).toHaveBeenCalledWith("id, venues!inner(zone_id, hidden)", {
      count: "exact",
      head: true,
    });
    expect(liveCountChain.eq).toHaveBeenCalledWith("venues.zone_id", "south-end-charlotte");
    expect(liveCountChain.eq).toHaveBeenCalledWith("hidden", false);
    expect(liveCountChain.eq).toHaveBeenCalledWith("venues.hidden", false);
    expect(liveCountChain.gt).toHaveBeenCalledWith("created_at", "2026-06-27T10:00:00.000Z");
    expect(venueCountChain.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(venueCountChain.eq).toHaveBeenCalledWith("zone_id", "south-end-charlotte");
    expect(venueCountChain.eq).toHaveBeenCalledWith("hidden", false);
  });

  it("returns 400 for invalid zoneId", async () => {
    const { GET } = await import("../zones/[zoneId]/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/zones/fake-zone/stats"), params("fake-zone"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).toEqual({ error: "Unknown zoneId." });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns zero live check-ins when the zone has no recent check-ins", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ count: 0 }))
      .mockReturnValueOnce(chain({ data: [] }))
      .mockReturnValueOnce(chain({ count: 4 }));

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
    mockFrom
      .mockReturnValueOnce(chain({ count: 4 }))
      .mockReturnValueOnce(
        chain({
          data: [
            { venue_id: "venue-a", venues: { id: "venue-a", name: "Alpha" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
            { venue_id: "venue-b", venues: { id: "venue-b", name: "Beta" } },
          ],
        }),
      )
      .mockReturnValueOnce(chain({ count: 6 }));

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
