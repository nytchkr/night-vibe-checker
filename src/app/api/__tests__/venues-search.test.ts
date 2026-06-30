import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());
const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ sql: mockSql }));
vi.mock("@/lib/upstashRateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, limit: 0, remaining: 0 })),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/upstashRedis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

function venue(id: string, name: string, overrides: Record<string, unknown> = {}) {
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
    open_now: true,
    venue_signals: [
      {
        venue_id: id,
        place_id: `place-${id}`,
        busyness_0_100: null,
        busyness_source: null,
        confidence_0_1: 0,
        computed_at: "2026-06-20T20:00:00.000Z",
        last_busyness_refresh: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
});

describe("GET /api/venues search", () => {
  it("uses ranked Postgres full-text search ids when q is present", async () => {
    mockSql
      .mockResolvedValueOnce([
        { id: "venue-b", search_rank: 0.8 },
        { id: "venue-a", search_rank: 0.4 },
      ])
      .mockResolvedValueOnce([venue("venue-a", "Alpha"), venue("venue-b", "Beta")]);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=rooftop"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=300");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-b", "venue-a"]);
  });

  it("applies category and radius filters to the ranked search rpc", async () => {
    mockSql.mockResolvedValueOnce([]);

    const { GET } = await import("../venues/route");
    const res = await GET(
      new NextRequest("http://localhost/api/venues?q=lounge&category=bar&lat=35.21&lng=-80.86&radius=500")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(json.data.venues).toEqual([]);
  });

  it("returns venues that match the search term by category", async () => {
    mockSql
      .mockResolvedValueOnce([{ id: "venue-bar", search_rank: 0.6 }])
      .mockResolvedValueOnce([
        venue("venue-bar", "Vinyl", {
          category: "bar",
          address: "Camden Road",
          neighborhood: "South End",
        }),
      ]);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=bar"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(json.data.venues).toHaveLength(1);
    expect(json.data.venues[0]).toMatchObject({ id: "venue-bar", category: "bar" });
  });

  it("passes through supported zone filters", async () => {
    mockSql
      .mockResolvedValueOnce([{ id: "venue-sp", search_rank: 1 }])
      .mockResolvedValueOnce([
        venue("venue-sp", "SouthPark Lounge", {
          zone_id: "south-park-charlotte",
          address: "South Park",
          lat: 35.1524,
          lng: -80.8462,
        }),
      ]);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=lounge&zone=south-park-charlotte"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-sp"]);
  });

  it("uses rating then name when venues have equal or missing busyness", async () => {
    mockSql.mockResolvedValueOnce([
        venue("venue-a", "Alpha", { rating: 4.2 }),
        venue("venue-b", "Beta", { google_rating: 4.8 }),
        venue("venue-c", "Charlie", { rating: 4.8 }),
    ]);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=300");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(mockRedisGet).toHaveBeenCalledWith("nv:venues:list");
    expect(mockRedisSet).toHaveBeenCalledWith(
      "nv:venues:list",
      expect.objectContaining({ venues: expect.any(Array) }),
      { ex: 120 }
    );
    expect(mockSql.mock.calls[0][0].join("")).toContain("LIMIT 200");
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual([
      "venue-b",
      "venue-c",
      "venue-a",
    ]);
  });

  it("uses private no-cache for authenticated venue list responses", async () => {
    mockSql.mockResolvedValueOnce([venue("venue-a", "Alpha")]);

    const { GET } = await import("../venues/route");
    const res = await GET(
      new NextRequest("http://localhost/api/venues", {
        headers: { Authorization: "Bearer test-token" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(mockRedisGet).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("returns the cached public venue list without hitting the DB", async () => {
    mockRedisGet.mockResolvedValueOnce({
      zone: { id: "south-end-charlotte" },
      venues: [venue("venue-a", "Alpha")],
    });

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=300");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockRedisGet).toHaveBeenCalledWith("nv:venues:list");
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(json.meta.cached).toBe(true);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-a"]);
  });

  it("returns 304 when If-None-Match matches the venue list etag", async () => {
    mockSql.mockResolvedValueOnce([venue("venue-a", "Alpha")]);
    mockSql.mockResolvedValueOnce([venue("venue-a", "Alpha")]);

    const { GET } = await import("../venues/route");
    const first = await GET(new NextRequest("http://localhost/api/venues"));
    const etag = first.headers.get("ETag");

    expect(etag).toBeTruthy();

    const second = await GET(
      new NextRequest("http://localhost/api/venues", {
        headers: { "If-None-Match": etag ?? "" },
      })
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("Cache-Control")).toBe("s-maxage=120, stale-while-revalidate=300");
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });
});
