import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockFrom, mockComputeVenueMfRatioFromCheckIns } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockComputeVenueMfRatioFromCheckIns: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

vi.mock("@/lib/mfRatio", () => ({
  computeVenueMfRatioFromCheckIns: mockComputeVenueMfRatioFromCheckIns,
}));

function queryResult(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

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
    rating: 4.6,
    google_rating: 4.6,
    total_ratings: 120,
    user_rating_count: 9,
    price_level: 2,
    hidden: false,
    open_now: true,
    phone: "704-555-0100",
    phone_number: "704-555-0100",
    website: "https://example.test",
    google_maps_uri: "https://maps.example.test/place",
    editorial_summary: "Cached launch-zone venue.",
    updated_at: "2026-06-23T01:30:00.000Z",
    venue_signals: [
      {
        venue_id: "venue-1",
        place_id: "place-venue-1",
        busyness_0_100: 72,
        busyness_source: "crowd",
        mf_ratio: 61,
        confidence_0_1: 0.5,
        sample_size: 10,
        computed_at: new Date().toISOString(),
        last_busyness_refresh: null,
      },
    ],
    ...overrides,
  };
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

describe("GET /api/venues/[id]", () => {
  it("returns 200 with cached venue data", async () => {
    const venueQuery = queryResult({ data: [venue()] });
    mockFrom.mockReturnValueOnce(venueQuery);

    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/place-venue-1"), {
      params: Promise.resolve({ id: "place-venue-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.venue).toMatchObject({
      id: "venue-1",
      placeId: "place-venue-1",
      name: "Cache Bar",
      address: "South End",
      phone: "704-555-0100",
      mf_ratio: 61,
      mf_sample_size: 10,
    });
    expect(json.data.venue.signal).toMatchObject({
      busyness0To100: 72,
      busynessSource: "crowd",
      mfRatio: 61,
    });
    expect(venueQuery.select).toHaveBeenCalledWith(expect.stringContaining("venue_signals"));
    expect(venueQuery.eq).toHaveBeenCalledWith("place_id", "place-venue-1");
    expect(venueQuery.eq).toHaveBeenCalledWith("hidden", false);
  });

  it("returns 404 when the venue is missing", async () => {
    mockFrom
      .mockReturnValueOnce(queryResult({ data: [] }))
      .mockReturnValueOnce(queryResult({ data: [] }));

    const { GET } = await import("../venues/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/missing-venue"), {
      params: Promise.resolve({ id: "missing-venue" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
