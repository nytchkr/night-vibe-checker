// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

const OPEN_MONDAY_NIGHT_HOURS = {
  open_now: true,
  periods: [
    {
      open: { day: 1, hour: 17, minute: 0 },
      close: { day: 2, hour: 2, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 5:00 PM - 2:00 AM"],
};

const CLOSED_MONDAY_NIGHT_HOURS = {
  open_now: false,
  periods: [
    {
      open: { day: 1, hour: 11, minute: 0 },
      close: { day: 1, hour: 14, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 11:00 AM - 2:00 PM"],
};

const SCORING_NOW = new Date("2026-06-23T16:00:00.000Z");
const FRIDAY_PEAK_NOW = new Date("2026-06-27T01:00:00.000Z");
const SATURDAY_PREGAME_NOW = new Date("2026-06-27T22:00:00.000Z");
const UPDATED_AT = "2026-06-23T15:30:00.000Z";

function queryResult(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function checkIns(venueId: string, count: number) {
  return Array.from({ length: count }, () => ({
    venue_id: venueId,
    created_at: "2026-06-23T01:00:00.000Z",
    hidden: false,
  }));
}

function venueRow({
  id,
  name,
  busyness,
  checkInCount,
  openingHours = OPEN_MONDAY_NIGHT_HOURS,
  openNow = true,
  rating = null,
}: {
  id: string;
  name: string;
  busyness: number | null;
  checkInCount: number;
  openingHours?: unknown;
  openNow?: boolean | null;
  rating?: number | null;
}) {
  const canonicalOpeningHours = openingHours && typeof openingHours === "object" && !Array.isArray(openingHours)
    ? { ...openingHours, open_now: openNow }
    : openingHours;

  return {
    id,
    place_id: `place-${id}`,
    zone_id: "south-end-charlotte",
    name,
    address: "South End",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    rating,
    google_rating: rating,
    total_ratings: 100,
    user_rating_count: 10,
    price_level: 2,
    photo_url: `https://example.test/${id}.jpg`,
    hidden: false,
    open_now: openNow,
    opening_hours: canonicalOpeningHours,
    updated_at: UPDATED_AT,
    venue_signals: [
      {
        venue_id: id,
        place_id: `place-${id}`,
        busyness_0_100: busyness,
        busyness_source: busyness == null ? "unavailable" : "live",
        mf_ratio: null,
        confidence_0_1: 0.5,
        sample_size: checkInCount,
        computed_at: UPDATED_AT,
        last_busyness_refresh: UPDATED_AT,
      },
    ],
    check_ins: checkIns(id, checkInCount),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(SCORING_NOW);
  mockSql.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trending venue scoring", () => {
  it("ranks high busyness as the top discovery score", async () => {
    const rows = [
      venueRow({ id: "venue-busy-fast", name: "Busy Fast", busyness: 100, checkInCount: 4 }),
      venueRow({ id: "venue-busy-slow", name: "Busy Slow", busyness: 100, checkInCount: 0 }),
      venueRow({ id: "venue-calm-fast", name: "Calm Fast", busyness: 20, checkInCount: 4 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows);

    expect(ranked[0]).toMatchObject({
      score: 0.7,
      venue: { id: "venue-busy-fast" },
    });
    expect(ranked.map((item) => item.venue.id)).toEqual([
      "venue-busy-fast",
      "venue-busy-slow",
      "venue-calm-fast",
    ]);
  });

  it("excludes closed venues from trending results", async () => {
    const rows = [
      venueRow({ id: "venue-closed", name: "Closed Bar", busyness: 80, checkInCount: 2, openingHours: CLOSED_MONDAY_NIGHT_HOURS, openNow: false }),
      venueRow({ id: "venue-open", name: "Open Bar", busyness: 80, checkInCount: 2 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows);

    expect(ranked.map((item) => item.venue.id)).toEqual(["venue-open"]);
    expect(ranked[0].venue.openNow).toBe(true);
    expect(ranked.some((item) => item.venue.id === "venue-closed")).toBe(false);
  });

  it("ignores check-in velocity in discovery-only trending", async () => {
    const rows = [
      venueRow({ id: "venue-recent", name: "Recent", busyness: 70, checkInCount: 1 }),
      venueRow({ id: "venue-quiet", name: "Quiet", busyness: 70, checkInCount: 0 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows);

    expect(ranked.map((item) => item.venue.id)).toEqual(["venue-quiet", "venue-recent"]);
    expect(ranked[0].score).toBeCloseTo(0.35 + 0.2);
    expect(ranked[1].score).toBeCloseTo(0.35 + 0.2);
  });

  it("boosts scores during ET peak night hours", async () => {
    const rows = [
      venueRow({ id: "venue-peak", name: "Peak", busyness: 100, checkInCount: 0 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows, 5, new Date("2026-06-24T01:00:00.000Z"));

    expect(ranked[0].score).toBeCloseTo((0.5 + 0.2) * 1.3);
  });

  it("applies the additional Friday or Saturday boost during ET night hours", async () => {
    const rows = [
      venueRow({ id: "venue-friday", name: "Friday Peak", busyness: 100, checkInCount: 0 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows, 5, FRIDAY_PEAK_NOW);

    expect(ranked[0].score).toBeCloseTo((0.5 + 0.2) * 1.3 * 1.2);
  });

  it("applies the Saturday pre-game ET boost before peak hours", async () => {
    const rows = [
      venueRow({ id: "venue-pregame", name: "Pregame", busyness: 100, checkInCount: 0 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows, 5, SATURDAY_PREGAME_NOW);

    expect(ranked[0].score).toBeCloseTo((0.5 + 0.2) * 1.1 * 1.2);
  });

  it("ranks venues with no busyness data by open-now and name", async () => {
    const rows = [
      venueRow({ id: "venue-low-velocity", name: "Low Velocity", busyness: null, checkInCount: 1 }),
      venueRow({ id: "venue-high-velocity", name: "High Velocity", busyness: null, checkInCount: 4 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows);

    expect(ranked.map((item) => item.venue.id)).toEqual(["venue-high-velocity", "venue-low-velocity"]);
    expect(ranked[0].score).toBeCloseTo(0.2);
    expect(ranked[1].score).toBeCloseTo(0.2);
  });

  it("breaks equal-score ties by venue name alphabetically", async () => {
    const rows = [
      venueRow({ id: "venue-zed", name: "Zed Room", busyness: 60, checkInCount: 2 }),
      venueRow({ id: "venue-alpha", name: "Alpha Room", busyness: 60, checkInCount: 2 }),
      venueRow({ id: "venue-metro", name: "Metro Room", busyness: 60, checkInCount: 2 }),
    ];

    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");
    const ranked = rankTrendingVenueRows(rows);

    expect(new Set(ranked.map((item) => item.score)).size).toBe(1);
    expect(ranked.map((item) => item.venue.name)).toEqual(["Alpha Room", "Metro Room", "Zed Room"]);
  });

  it("returns an empty array for empty input", async () => {
    const { rankTrendingVenueRows } = await import("@/lib/trendingVenueIds");

    expect(rankTrendingVenueRows([])).toEqual([]);
  });

  it("loads and ranks rows through the mocked Neon query", async () => {
    mockSql.mockResolvedValue([
      venueRow({ id: "venue-alpha", name: "Alpha", busyness: 30, checkInCount: 1 }),
      venueRow({ id: "venue-top", name: "Top", busyness: 100, checkInCount: 3 }),
    ]);

    const { getTrendingVenues } = await import("@/lib/trendingVenueIds");
    const venues = await getTrendingVenues(SCORING_NOW);

    expect(venues.map((venue) => venue.id)).toEqual(["venue-top", "venue-alpha"]);
    expect(mockSql).toHaveBeenCalled();
  });
});
