import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetRequestUserId = vi.fn();
const mockGetUserSubscriptionStatus = vi.fn();
const mockIsActiveProSubscription = vi.fn();
const mockFindVisibleVenueByIdOrPlaceId = vi.fn();
const mockFetchBestTimeDayRawForecast = vi.fn();

vi.mock("@/lib/subscription", () => ({
  getRequestUserId: mockGetRequestUserId,
  getUserSubscriptionStatus: mockGetUserSubscriptionStatus,
  isActiveProSubscription: mockIsActiveProSubscription,
}));

vi.mock("@/lib/venueLookup", async () => {
  const actual = await vi.importActual<typeof import("@/lib/venueLookup")>("@/lib/venueLookup");
  return {
    ...actual,
    findVisibleVenueByIdOrPlaceId: mockFindVisibleVenueByIdOrPlaceId,
  };
});

vi.mock("@/lib/besttime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/besttime")>("@/lib/besttime");
  return {
    ...actual,
    fetchBestTimeDayRawForecast: mockFetchBestTimeDayRawForecast,
  };
});

function request() {
  return new NextRequest("http://localhost/api/venues/venue-1/prediction");
}

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

function venue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    place_id: "place-1",
    name: "Night Spot",
    category: "bar",
    rating: 4.4,
    google_rating: 4.4,
    total_ratings: 120,
    user_rating_count: 120,
    opening_hours: { weekdayDescriptions: ["Friday: 8:00 PM - 2:00 AM"] },
    open_now: true,
    besttime_venue_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetRequestUserId.mockResolvedValue("user-1");
  mockGetUserSubscriptionStatus.mockResolvedValue({ status: "active" });
  mockIsActiveProSubscription.mockReturnValue(true);
});

describe("GET /api/venues/[id]/prediction", () => {
  it("returns a BestTime forecast prediction when hourly forecast data exists", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({
      data: venue({ besttime_venue_id: "besttime-1" }),
      error: null,
    });
    mockFetchBestTimeDayRawForecast.mockResolvedValue({
      venueId: "besttime-1",
      dayInt: 4,
      updatedOn: "2026-06-22T20:00:00.000Z",
      hours: [
        { hour: 21, busyness: 40 },
        { hour: 22, busyness: 70 },
        { hour: 23, busyness: 92 },
      ],
    });

    const { GET } = await import("../venues/[id]/prediction/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.source).toBe("besttime_forecast");
    expect(json.isStub).toBeUndefined();
    expect(json.prediction).toMatchObject({
      source: "besttime_forecast",
      peakHour: 23,
      peakBusyness: 92,
      bestArrivalHour: 22,
      confidenceScore: 0.9,
      vibeLabel: "Peak Hours",
    });
  });

  it("falls back to Google venue facts without fabricating busyness", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({
      data: venue({ besttime_venue_id: null }),
      error: null,
    });

    const { GET } = await import("../venues/[id]/prediction/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.source).toBe("google_popularity_fallback");
    expect(json.prediction).toMatchObject({
      source: "google_popularity_fallback",
      peakBusyness: null,
      confidenceScore: 0.5,
    });
    expect(mockFetchBestTimeDayRawForecast).not.toHaveBeenCalled();
  });

  it("returns unavailable when neither forecast nor Google facts exist", async () => {
    mockFindVisibleVenueByIdOrPlaceId.mockResolvedValue({
      data: venue({
        rating: null,
        google_rating: null,
        total_ratings: null,
        user_rating_count: null,
        opening_hours: null,
        open_now: null,
        besttime_venue_id: null,
      }),
      error: null,
    });

    const { GET } = await import("../venues/[id]/prediction/route");
    const res = await GET(request(), params());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      available: false,
      reason: "No forecast data for this venue",
    });
    expect(json.prediction).toBeUndefined();
  });
});
