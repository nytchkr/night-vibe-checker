import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindVisibleVenueByIdOrPlaceId = vi.fn();

vi.mock("@/lib/venueLookup", () => ({
  findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
  normalizeVenueLookupId: (id: string) => id.trim(),
}));

function venue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    place_id: "place-venue-1",
    zone_id: "south-end-charlotte",
    name: "Cache Bar",
    address: "South End",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    rating: null,
    google_rating: null,
    hidden: false,
    open_now: true,
    updated_at: "2026-06-23T01:30:00.000Z",
    venue_signals: [
      {
        venue_id: "venue-1",
        place_id: "place-venue-1",
        busyness_0_100: 72,
        busyness_source: "crowd",
        mf_ratio: null,
        confidence_0_1: 0.5,
        sample_size: 10,
        computed_at: "2026-06-23T01:30:00.000Z",
        last_busyness_refresh: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/venues/[id] cache headers", () => {
  it("sets the public edge cache header on venue detail responses", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue(),
      error: null,
    });

    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-1"), {
      params: Promise.resolve({ id: "venue-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=120");
    expect(json.data.venue.id).toBe("venue-1");
  });
});
