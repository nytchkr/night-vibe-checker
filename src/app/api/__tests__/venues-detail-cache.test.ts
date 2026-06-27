import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=600");
    expect(json.data.venue.id).toBe("venue-1");
  });

  it("hydrates missing venue photos from Google Places details server-side", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/place/details/json");
      expect(url.searchParams.get("place_id")).toBe("place-venue-1");
      expect(url.searchParams.get("fields")).toBe("photos");
      expect(url.searchParams.get("key")).toBe("places-test-key");

      return Response.json({
        status: "OK",
        result: {
          photos: [
            { photo_reference: "photo-ref-1" },
            { photo_reference: "photo-ref-2" },
            { photo_reference: "photo-ref-3" },
            { photo_reference: "photo-ref-4" },
            { photo_reference: "photo-ref-5" },
            { photo_reference: "photo-ref-6" },
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-1"), {
      params: Promise.resolve({ id: "venue-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.data.venue.photoUrl).toBe(
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-1&key=places-test-key"
    );
    expect(json.data.venue.photoUrls).toEqual([
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-1&key=places-test-key",
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-2&key=places-test-key",
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-3&key=places-test-key",
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-4&key=places-test-key",
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=photo-ref-5&key=places-test-key",
    ]);
    expect(json.data.venue.photo_urls).toEqual(json.data.venue.photoUrls);
  });
});
