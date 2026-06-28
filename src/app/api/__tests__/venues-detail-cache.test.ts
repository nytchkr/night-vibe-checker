import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockFindVisibleVenueByIdOrPlaceId, mockComputeVenueMfRatioFromCheckIns } = vi.hoisted(() => ({
  mockFindVisibleVenueByIdOrPlaceId: vi.fn(),
  mockComputeVenueMfRatioFromCheckIns: vi.fn(),
}));

vi.mock("@/lib/venueLookup", () => ({
  findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
  normalizeVenueLookupId: (id: string) => id.trim(),
}));

vi.mock("@/lib/mfRatio", () => ({
  computeVenueMfRatioFromCheckIns: mockComputeVenueMfRatioFromCheckIns,
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {},
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

async function getVenueDetail(id = "venue-1") {
  const { GET } = await import("../venues/[id]/route");
  return GET(new NextRequest(`http://localhost/api/venues/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function googlePhotoUrl(reference: string, key = "places-test-key") {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${reference}&key=${key}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockComputeVenueMfRatioFromCheckIns.mockResolvedValue({
    mfRatio: null,
    sampleSize: 0,
    computedAt: "2026-06-28T04:00:00.000Z",
  });
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

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=600");
    expect(json.data.venue.id).toBe("venue-1");
  });

  it("uses live check-in ratio when the cached venue signal ratio is null", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue(),
      error: null,
    });
    mockComputeVenueMfRatioFromCheckIns.mockResolvedValueOnce({
      mfRatio: 60,
      sampleSize: 5,
      computedAt: "2026-06-28T04:00:00.000Z",
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockComputeVenueMfRatioFromCheckIns).toHaveBeenCalledWith("venue-1");
    expect(json.data.venue.signal.mfRatio).toBe(60);
    expect(json.data.venue.signal.sampleSize).toBe(5);
    expect(json.data.venue.mf_ratio).toBe(60);
    expect(json.data.venue.mf_sample_size).toBe(5);
  });

  it("hides stale cached ratio when live check-ins are below the ratio sample floor", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({
        venue_signals: [
          {
            venue_id: "venue-1",
            place_id: "place-venue-1",
            busyness_0_100: 72,
            busyness_source: "crowd",
            mf_ratio: 64,
            confidence_0_1: 0.5,
            sample_size: 10,
            computed_at: "2026-06-26T04:00:00.000Z",
            last_busyness_refresh: null,
          },
        ],
      }),
      error: null,
    });
    mockComputeVenueMfRatioFromCheckIns.mockResolvedValueOnce({
      mfRatio: null,
      sampleSize: 4,
      computedAt: "2026-06-28T04:00:00.000Z",
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.venue.signal.busyness0To100).toBe(72);
    expect(json.data.venue.signal.mfRatio).toBeNull();
    expect(json.data.venue.signal.sampleSize).toBe(4);
    expect(json.data.venue.mf_ratio).toBeNull();
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
          ],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.data.venue.photoUrl).toBe(googlePhotoUrl("photo-ref-1"));
    expect(json.data.venue.photoUrls).toEqual([googlePhotoUrl("photo-ref-1"), googlePhotoUrl("photo-ref-2")]);
    expect(json.data.venue.photo_urls).toEqual(json.data.venue.photoUrls);
  });

  it("does not call Google Places when the cached venue already has a primary photo URL", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: "https://cdn.example.test/cache-bar.jpg", photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.data.venue.photoUrl).toBe("https://cdn.example.test/cache-bar.jpg");
    expect(json.data.venue.photoUrls).toEqual(["https://cdn.example.test/cache-bar.jpg"]);
    expect(json.data.venue.photo_urls).toEqual(json.data.venue.photoUrls);
  });

  it("returns 200 with empty photo URLs when GOOGLE_PLACES_API_KEY is missing", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.data.venue.photoUrl).toBeUndefined();
    expect(json.data.venue.photoUrls).toBeUndefined();
    expect(json.data.venue.photo_urls).toBeUndefined();
  });

  it("returns 200 with empty photo URLs when Google Places details status is not OK", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "REQUEST_DENIED",
        error_message: "API key blocked",
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.data.venue.photoUrl).toBeUndefined();
    expect(json.data.venue.photoUrls).toBeUndefined();
    expect(json.data.venue.photo_urls).toBeUndefined();
  });

  it("returns 200 with empty photo URLs when Google Places details returns zero photos", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "OK",
        result: {
          photos: [],
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.data.venue.photoUrl).toBeUndefined();
    expect(json.data.venue.photoUrls).toBeUndefined();
    expect(json.data.venue.photo_urls).toBeUndefined();
  });

  it("caps hydrated Google photo URLs at five", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn(async () =>
      Response.json({
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
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValueOnce({
      data: venue({ photo_url: null, photo_urls: [] }),
      error: null,
    });

    const res = await getVenueDetail();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json.data.venue.photoUrls).toEqual([
      googlePhotoUrl("photo-ref-1"),
      googlePhotoUrl("photo-ref-2"),
      googlePhotoUrl("photo-ref-3"),
      googlePhotoUrl("photo-ref-4"),
      googlePhotoUrl("photo-ref-5"),
    ]);
    expect(json.data.venue.photoUrls).toHaveLength(5);
    expect(json.data.venue.photo_urls).toEqual(json.data.venue.photoUrls);
  });
});
