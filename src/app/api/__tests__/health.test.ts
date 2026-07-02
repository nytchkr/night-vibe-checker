import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  sql: mockSql,
}));

function venueRow(lastBusynessRefresh: string, overrides: Record<string, unknown> = {}) {
  return {
    zone_id: "south-end-charlotte",
    besttime_venue_id: "bt-venue-1",
    category: "bar",
    venue_type: "bar",
    opening_hours: null,
    open_now: true,
    venue_signals: { busyness_0_100: 72, last_busyness_refresh: lastBusynessRefresh },
    ...overrides,
  };
}

const openSundayNightHours = {
  periods: [
    {
      open: { day: 0, hour: 17, minute: 0 },
      close: { day: 1, hour: 2, minute: 0 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-22T03:44:23.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("keeps daily BestTime cache refreshes healthy within the grace window", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([
        venueRow("2026-06-21T14:18:32.113Z"),
        venueRow("2026-06-21T14:21:27.265Z"),
      ]);

    const { GET } = await import("../health/route");
    const res = await GET(new NextRequest("http://localhost/api/health"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=300");
    expect(json.status).toBe("ok");
    expect(json.venue_count).toBe(100);
    expect(json.signals_count).toBe(100);
    expect(json.openNowCount).toBe(2);
    expect(json.zones_with_signal_coverage).toEqual({
      "south-end-charlotte": 2,
      "dilworth-charlotte": 0,
      "south-park-charlotte": 0,
    });
    expect(json.besttime_coverage_by_zone).toEqual([
      {
        zone_id: "south-end-charlotte",
        zone_name: "South End",
        venues: 2,
        with_besttime_venue_id: 2,
        without_besttime_venue_id: 0,
        with_signal: 2,
        without_signal: 0,
        lastBusynessRefresh: "2026-06-21T14:21:27.265Z",
      },
      {
        zone_id: "dilworth-charlotte",
        zone_name: "Dilworth / Myers Park",
        venues: 0,
        with_besttime_venue_id: 0,
        without_besttime_venue_id: 0,
        with_signal: 0,
        without_signal: 0,
        lastBusynessRefresh: null,
      },
      {
        zone_id: "south-park-charlotte",
        zone_name: "South Park",
        venues: 0,
        with_besttime_venue_id: 0,
        without_besttime_venue_id: 0,
        with_signal: 0,
        without_signal: 0,
        lastBusynessRefresh: null,
      },
    ]);
    expect(json.staleSince).toBeNull();
    expect(json.lastBusynessRefresh).toBe("2026-06-21T14:21:27.265Z");
    expect(mockSql).toHaveBeenCalledTimes(3);
  });

  it("reports venue BestTime and signal coverage for each launch zone", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([
        venueRow("2026-06-21T14:18:32.113Z"),
        venueRow("2026-06-21T14:21:27.265Z", {
          zone_id: "dilworth-charlotte",
          besttime_venue_id: null,
          venue_signals: { busyness_0_100: null, last_busyness_refresh: "2026-06-21T14:21:27.265Z" },
        }),
        venueRow("2026-06-21T14:22:27.265Z", {
          zone_id: "south-park-charlotte",
          besttime_venue_id: "bt-venue-3",
          venue_signals: { busyness_0_100: 63, last_busyness_refresh: "2026-06-21T14:22:27.265Z" },
        }),
      ]);

    const { GET } = await import("../health/route");
    const res = await GET(new NextRequest("http://localhost/api/health"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.zones_with_signal_coverage).toEqual({
      "south-end-charlotte": 1,
      "dilworth-charlotte": 0,
      "south-park-charlotte": 1,
    });
    expect(json.besttime_coverage_by_zone).toMatchObject([
      {
        zone_id: "south-end-charlotte",
        venues: 1,
        with_besttime_venue_id: 1,
        without_besttime_venue_id: 0,
        with_signal: 1,
        without_signal: 0,
      },
      {
        zone_id: "dilworth-charlotte",
        venues: 1,
        with_besttime_venue_id: 0,
        without_besttime_venue_id: 1,
        with_signal: 0,
        without_signal: 1,
      },
      {
        zone_id: "south-park-charlotte",
        venues: 1,
        with_besttime_venue_id: 1,
        without_besttime_venue_id: 0,
        with_signal: 1,
        without_signal: 0,
      },
    ]);
  });

  it("computes openNowCount from Google periods when the DB open_now column is null", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        venueRow("2026-06-21T14:18:32.113Z", {
          open_now: null,
          opening_hours: openSundayNightHours,
        }),
      ]);

    const { GET } = await import("../health/route");
    const res = await GET(new NextRequest("http://localhost/api/health"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.openNowCount).toBe(1);
  });

  it("degrades when a full daily busyness refresh is missed", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([
        venueRow("2026-06-20T20:00:00.000Z"),
        venueRow("2026-06-21T14:21:27.265Z"),
      ]);

    const { GET } = await import("../health/route");
    const res = await GET(new NextRequest("http://localhost/api/health"));
    const json = await res.json();

    expect(json.status).toBe("degraded");
    expect(json.staleSince).toBe("2026-06-20T20:00:00.000Z");
  });

  it("degrades when signal coverage drops below eighty percent", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 100 }])
      .mockResolvedValueOnce([{ count: 79 }])
      .mockResolvedValueOnce([venueRow("2026-06-21T14:21:27.265Z")]);

    const { GET } = await import("../health/route");
    const res = await GET(new NextRequest("http://localhost/api/health"));
    const json = await res.json();

    expect(json.status).toBe("degraded");
    expect(json.staleSince).toBeNull();
  });
});
