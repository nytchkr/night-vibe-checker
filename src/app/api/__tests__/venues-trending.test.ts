import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

const OPEN_MONDAY_NIGHT_HOURS = {
  periods: [
    {
      open: { day: 1, hour: 17, minute: 0 },
      close: { day: 2, hour: 2, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 5:00 PM - 2:00 AM"],
};

const CLOSED_MONDAY_NIGHT_HOURS = {
  periods: [
    {
      open: { day: 1, hour: 11, minute: 0 },
      close: { day: 1, hour: 14, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 11:00 AM - 2:00 PM"],
};

function venue(
  id: string,
  name: string,
  busyness: number | null = null,
  openingHours: unknown = OPEN_MONDAY_NIGHT_HOURS,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    place_id: `place-${id}`,
    zone_id: "south-end-charlotte",
    name,
    address: "South End",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    rating: null,
    google_rating: null,
    hidden: false,
    photo_url: `https://example.com/${id}.jpg`,
    open_now: true,
    updated_at: "2026-06-23T01:30:00.000Z",
    opening_hours: openingHours,
    venue_signals: [
      {
        venue_id: id,
        place_id: `place-${id}`,
        busyness_0_100: busyness,
        busyness_source: busyness == null ? null : "crowd",
        mf_ratio: null,
        confidence_0_1: 0,
        sample_size: 0,
        computed_at: "2026-06-20T20:00:00.000Z",
        last_busyness_refresh: null,
      },
    ],
    ...overrides,
  };
}

function checkIn(venueId: string) {
  return {
    venue_id: venueId,
    created_at: "2026-06-23T01:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-23T02:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/venues/trending", () => {
  it("returns the top 5 visible launch-zone venues sorted by recent check-in count, then busyness, rating, and name", async () => {
    const checkInsQuery = chain({
      data: [
        checkIn("venue-a"),
        checkIn("venue-b"),
        checkIn("venue-b"),
        checkIn("venue-c"),
        checkIn("venue-c"),
        checkIn("venue-d"),
        checkIn("venue-d"),
        checkIn("venue-e"),
        checkIn("venue-e"),
        checkIn("venue-f"),
        checkIn("venue-f"),
        checkIn("venue-g"),
      ],
    });
    const venuesQuery = chain({
      data: [
        venue("venue-a", "Alpha", 20),
        venue("venue-b", "Beta", 80),
        venue("venue-c", "Charlie", 50),
        venue("venue-d", "Delta", 96),
        venue("venue-e", "Echo", null, OPEN_MONDAY_NIGHT_HOURS, { rating: 4.8 }),
        venue("venue-f", "Foxtrot", null, OPEN_MONDAY_NIGHT_HOURS, { rating: 4.2 }),
        venue("venue-g", "Gamma", 88),
      ],
    });
    mockFrom.mockReturnValueOnce(checkInsQuery).mockReturnValueOnce(venuesQuery);

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json.status).toBe("success");
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual([
      "venue-d",
      "venue-b",
      "venue-c",
      "venue-e",
      "venue-f",
    ]);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(checkInsQuery.gte).toHaveBeenCalledWith("created_at", "2026-06-22T02:00:00.000Z");
    expect(checkInsQuery.eq).toHaveBeenCalledWith("hidden", false);
    expect(checkInsQuery.limit).toHaveBeenCalledWith(500);
    expect(mockFrom).toHaveBeenNthCalledWith(2, "venues");
    expect(venuesQuery.eq).toHaveBeenCalledWith("hidden", false);
    expect(venuesQuery.in).toHaveBeenCalledWith("zone_id", [
      "south-end-charlotte",
      "dilworth-charlotte",
      "south-park-charlotte",
    ]);
    expect(venuesQuery.in).toHaveBeenCalledWith("id", [
      "venue-a",
      "venue-b",
      "venue-c",
      "venue-d",
      "venue-e",
      "venue-f",
      "venue-g",
    ]);
    expect(venuesQuery.limit).toHaveBeenCalledWith(100);
  });

  it("returns an empty list when there are no recent check-ins", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [] }));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.venues).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("excludes venues that are currently closed by Google opening hours", async () => {
    mockFrom.mockReturnValueOnce(
      chain({
        data: [checkIn("venue-open"), checkIn("venue-closed")],
      })
    );
    mockFrom.mockReturnValueOnce(
      chain({
        data: [
          venue("venue-open", "Open Bar", 60),
          venue("venue-closed", "Closed Bar", 99, CLOSED_MONDAY_NIGHT_HOURS),
        ],
      })
    );

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-open"]);
    expect(json.data.venues[0].openNow).toBe(true);
  });

  it("excludes venues with missing or unparsable hours instead of assuming they are open", async () => {
    mockFrom.mockReturnValueOnce(
      chain({
        data: [checkIn("venue-open"), checkIn("venue-missing-hours"), checkIn("venue-unparsable-hours")],
      })
    );
    mockFrom.mockReturnValueOnce(
      chain({
        data: [
          venue("venue-open", "Open Bar", 60),
          venue("venue-missing-hours", "Missing Hours", 99, null),
          venue("venue-unparsable-hours", "Unparsable Hours", 98, { periods: [] }),
        ],
      })
    );

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-open"]);
  });

  it("excludes venues with stale hours even when cached open_now is true", async () => {
    mockFrom.mockReturnValueOnce(
      chain({
        data: [checkIn("venue-open"), checkIn("venue-stale")],
      })
    );
    mockFrom.mockReturnValueOnce(
      chain({
        data: [
          venue("venue-open", "Open Bar", 60),
          {
            ...venue("venue-stale", "Stale Bar", 99),
            updated_at: "2026-06-21T01:30:00.000Z",
          },
        ],
      })
    );

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-open"]);
  });

  it("returns DB_ERROR when venues cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [checkIn("venue-a")] }));
    mockFrom.mockReturnValueOnce(chain({ error: { message: "venues unavailable" } }));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });

  it("returns DB_ERROR when recent check-ins cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "check-ins unavailable" } }));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});
