import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerVenue } from "@/types";

const getTrendingVenues = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/lib/trendingVenueIds", () => ({
  getTrendingVenues,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit,
  rateLimitHeaders: (rate: { remaining: number; limit: number; resetAt: number }) => ({
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.resetAt),
  }),
}));

const venue: ConsumerVenue = {
  id: "venue-a",
  placeId: "place-venue-a",
  zoneId: "south-end-charlotte",
  name: "Alpha",
  address: "South End",
  lat: 35.2123,
  lng: -80.859,
  neighborhood: "South End",
  category: "bar",
  rating: null,
  userRatingCount: undefined,
  priceLevel: null,
  openNow: true,
  current_popularity: null,
  vibe_score: null,
  trending: true,
  hidden: false,
  signal: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockReturnValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: 123456,
  });
});

describe("GET /api/venues/trending", () => {
  it("returns trending venues from the shared trending service", async () => {
    getTrendingVenues.mockResolvedValueOnce([venue]);

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=600");
    expect(json.status).toBe("success");
    expect(json.data.venues).toEqual([venue]);
    expect(getTrendingVenues).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith("venues:trending:anonymous", 60, 60_000);
  });

  it("returns DB_ERROR when trending venues cannot be loaded", async () => {
    getTrendingVenues.mockRejectedValueOnce(new Error("database unavailable"));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json.error.code).toBe("DB_ERROR");
  });

  it("returns RATE_LIMITED when the request is over limit", async () => {
    checkRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: 123456,
      retryAfterMs: 15_000,
    });

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("15");
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(getTrendingVenues).not.toHaveBeenCalled();
  });
});
