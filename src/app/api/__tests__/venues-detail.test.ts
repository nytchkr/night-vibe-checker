import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFindVenue = vi.hoisted(() => vi.fn());
const mockGetRatingAggregate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/venueLookup", () => ({
  findVisibleVenueByIdOrPlaceId: mockFindVenue,
  normalizeVenueLookupId: (v: string) => v,
}));
vi.mock("@/lib/venueRatingAggregate", () => ({ getVenueRatingAggregate: mockGetRatingAggregate }));
vi.mock("@/lib/db", () => ({ sql: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/upstashRateLimit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 60, remaining: 59 }), rateLimitHeaders: () => ({}) }));

const VENUE = {
  id: "venue-1",
  place_id: "place-venue-1",
  zone_id: "south-end-charlotte",
  name: "Cache Bar",
  address: "South End",
  lat: 35.2123,
  lng: -80.859,
  category: "bar",
  rating: 4.6,
  google_rating: 4.6,
  total_ratings: 120,
  user_rating_count: 9,
  price_level: 2,
  hidden: false,
  open_now: true,
  phone_number: "704-555-0100",
  website: "https://example.test",
  google_maps_uri: "https://maps.example.test/place",
  editorial_summary: "Cached launch-zone venue.",
  updated_at: "2026-06-23T01:30:00.000Z",
  venue_signals: { venue_id: "venue-1", busyness_0_100: 72, busyness_source: "live", confidence_0_1: 0.5, computed_at: new Date().toISOString(), last_busyness_refresh: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockFindVenue.mockResolvedValue({ data: VENUE, error: null });
  mockGetRatingAggregate.mockResolvedValue(null);
});

describe("GET /api/venues/[id]", () => {
  it("returns 200 with cached venue data", async () => {
    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/place-venue-1"), {
      params: Promise.resolve({ id: "place-venue-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.venue).toMatchObject({ id: "venue-1", name: "Cache Bar" });
  });

  it("returns 404 when the venue is missing", async () => {
    mockFindVenue.mockResolvedValue({ data: null, error: null });

    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/missing-venue"), {
      params: Promise.resolve({ id: "missing-venue" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
  });
});
