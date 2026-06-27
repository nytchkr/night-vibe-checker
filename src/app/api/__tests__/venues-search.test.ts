import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/venues search", () => {
  it("uses ranked Postgres full-text search ids when q is present", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: "venue-b", search_rank: 0.8 },
        { id: "venue-a", search_rank: 0.4 },
      ],
      error: null,
    });
    const query = chain({ data: [venue("venue-a", "Alpha"), venue("venue-b", "Beta")] });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=rooftop"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=300");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(mockRpc).toHaveBeenCalledWith("search_venue_ids", {
      search_query: "rooftop",
      search_zone_id: null,
      search_category: null,
      center_lat: null,
      center_lng: null,
      radius_m: null,
      max_results: 100,
    });
    expect(query.in).toHaveBeenCalledWith("id", ["venue-b", "venue-a"]);
    expect(query.order).not.toHaveBeenCalled();
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-b", "venue-a"]);
  });

  it("applies category and radius filters to the ranked search rpc", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const { GET } = await import("../venues/route");
    const res = await GET(
      new NextRequest("http://localhost/api/venues?q=lounge&category=bar&lat=35.21&lng=-80.86&radius=500")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("search_venue_ids", {
      search_query: "lounge",
      search_zone_id: null,
      search_category: "bar",
      center_lat: 35.21,
      center_lng: -80.86,
      radius_m: 500,
      max_results: 100,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(json.data.venues).toEqual([]);
  });

  it("returns venues that match the search term by category", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: "venue-bar", search_rank: 0.6 }],
      error: null,
    });
    const query = chain({
      data: [
        venue("venue-bar", "Vinyl", {
          category: "bar",
          address: "Camden Road",
          neighborhood: "South End",
        }),
      ],
    });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=bar"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("search_venue_ids", {
      search_query: "bar",
      search_zone_id: null,
      search_category: null,
      center_lat: null,
      center_lng: null,
      radius_m: null,
      max_results: 100,
    });
    expect(query.in).toHaveBeenCalledWith("id", ["venue-bar"]);
    expect(json.data.venues).toHaveLength(1);
    expect(json.data.venues[0]).toMatchObject({ id: "venue-bar", category: "bar" });
  });

  it("passes through supported zone filters", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: "venue-sp", search_rank: 1 }],
      error: null,
    });
    const query = chain({
      data: [
        venue("venue-sp", "SouthPark Lounge", {
          zone_id: "south-park-charlotte",
          address: "South Park",
          lat: 35.1524,
          lng: -80.8462,
        }),
      ],
    });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues?q=lounge&zone=south-park-charlotte"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("search_venue_ids", {
      search_query: "lounge",
      search_zone_id: "south-park-charlotte",
      search_category: null,
      center_lat: null,
      center_lng: null,
      radius_m: null,
      max_results: 100,
    });
    expect(query.in).toHaveBeenCalledWith("zone_id", ["south-park-charlotte"]);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual(["venue-sp"]);
  });

  it("uses rating then name when venues have equal or missing busyness", async () => {
    const query = chain({
      data: [
        venue("venue-a", "Alpha", { rating: 4.2 }),
        venue("venue-b", "Beta", { google_rating: 4.8 }),
        venue("venue-c", "Charlie", { rating: 4.8 }),
      ],
    });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/route");
    const res = await GET(new NextRequest("http://localhost/api/venues"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=300");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual([
      "venue-b",
      "venue-c",
      "venue-a",
    ]);
  });

  it("uses private no-cache for authenticated venue list responses", async () => {
    const query = chain({ data: [venue("venue-a", "Alpha")] });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/route");
    const res = await GET(
      new NextRequest("http://localhost/api/venues", {
        headers: { Authorization: "Bearer test-token" },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("ETag")).toMatch(/^"venues-.+"$/);
  });

  it("returns 304 when If-None-Match matches the venue list etag", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [venue("venue-a", "Alpha")] }));
    mockFrom.mockReturnValueOnce(chain({ data: [venue("venue-a", "Alpha")] }));

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
    expect(second.headers.get("Cache-Control")).toBe("s-maxage=60, stale-while-revalidate=300");
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });
});
