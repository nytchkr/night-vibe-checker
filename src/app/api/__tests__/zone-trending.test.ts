import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

const OPEN_MONDAY_HOURS = {
  open_now: true,
  periods: [
    {
      open: { day: 1, hour: 17, minute: 0 },
      close: { day: 2, hour: 2, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 5:00 PM - 2:00 AM"],
};

const CLOSED_MONDAY_HOURS = {
  open_now: false,
  periods: [
    {
      open: { day: 1, hour: 11, minute: 0 },
      close: { day: 1, hour: 14, minute: 0 },
    },
  ],
  weekdayDescriptions: ["Monday: 11:00 AM - 2:00 PM"],
};

function params(zoneId: string) {
  return { params: Promise.resolve({ zoneId }) };
}

function checkIns(venueId: string, count: number) {
  return Array.from({ length: count }, () => ({
    venue_id: venueId,
    created_at: "2026-06-23T15:30:00.000Z",
    hidden: false,
  }));
}

function venueRow({
  id,
  name,
  busyness,
  checkInCount,
  openingHours = OPEN_MONDAY_HOURS,
  openNow = true,
}: {
  id: string;
  name: string;
  busyness: number | null;
  checkInCount: number;
  openingHours?: unknown;
  openNow?: boolean | null;
}) {
  const canonicalOpeningHours =
    openingHours && typeof openingHours === "object" && !Array.isArray(openingHours)
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
    rating: null,
    google_rating: null,
    total_ratings: 100,
    user_rating_count: 10,
    price_level: 2,
    photo_url: `https://example.test/${id}.jpg`,
    hidden: false,
    open_now: openNow,
    opening_hours: canonicalOpeningHours,
    updated_at: "2026-06-23T15:30:00.000Z",
    venue_signals: [
      {
        venue_id: id,
        place_id: `place-${id}`,
        busyness_0_100: busyness,
        busyness_source: busyness == null ? "unavailable" : "live",
        confidence_0_1: 0.5,
        sample_size: checkInCount,
        computed_at: "2026-06-23T15:30:00.000Z",
        last_busyness_refresh: "2026-06-23T15:30:00.000Z",
      },
    ],
    check_ins: checkIns(id, checkInCount),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-23T16:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/zones/[zoneId]/trending", () => {
  it("returns the top five scored venues for a valid zone", async () => {
    mockSql.mockResolvedValueOnce([
        venueRow({ id: "venue-one", name: "One", busyness: 100, checkInCount: 4 }),
        venueRow({ id: "venue-two", name: "Two", busyness: 90, checkInCount: 3 }),
        venueRow({ id: "venue-three", name: "Three", busyness: 80, checkInCount: 2 }),
        venueRow({ id: "venue-four", name: "Four", busyness: 70, checkInCount: 1 }),
        venueRow({ id: "venue-five", name: "Five", busyness: 60, checkInCount: 0 }),
        venueRow({ id: "venue-six", name: "Six", busyness: 10, checkInCount: 0 }),
    ]);

    const { GET } = await import("../zones/[zoneId]/trending/route");
    const res = await GET(
      new NextRequest("http://localhost/api/zones/south-end-charlotte/trending"),
      params("south-end-charlotte"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=120");
    expect(json.zoneId).toBe("south-end-charlotte");
    expect(json.venues.map((venue: { id: string }) => venue.id)).toEqual([
      "venue-one",
      "venue-two",
      "venue-three",
      "venue-four",
      "venue-five",
    ]);
    expect(json.venues[0]).toMatchObject({
      id: "venue-one",
      name: "One",
      busyness: 100,
      openNow: true,
    });
    expect(json.venues[0].score).toBeCloseTo(0.7);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid zoneId", async () => {
    const { GET } = await import("../zones/[zoneId]/trending/route");
    const res = await GET(
      new NextRequest("http://localhost/api/zones/fake-zone/trending"),
      params("fake-zone"),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).toEqual({ error: "Unknown zoneId." });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("excludes venues where openNow resolves to false", async () => {
    mockSql.mockResolvedValueOnce([
          venueRow({
            id: "venue-closed",
            name: "Closed",
            busyness: 100,
            checkInCount: 10,
            openingHours: CLOSED_MONDAY_HOURS,
            openNow: false,
          }),
          venueRow({ id: "venue-open", name: "Open", busyness: 20, checkInCount: 0 }),
    ]);

    const { GET } = await import("../zones/[zoneId]/trending/route");
    const res = await GET(
      new NextRequest("http://localhost/api/zones/dilworth-charlotte/trending"),
      params("dilworth-charlotte"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.venues.map((venue: { id: string }) => venue.id)).toEqual(["venue-open"]);
  });

  it("returns a no-store 500 when the zone venue query fails", async () => {
    mockSql.mockRejectedValueOnce(new Error("database unavailable"));

    const { GET } = await import("../zones/[zoneId]/trending/route");
    const res = await GET(
      new NextRequest("http://localhost/api/zones/south-park-charlotte/trending"),
      params("south-park-charlotte"),
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).toEqual({ error: "Could not load zone trending venues." });
  });
});
