import { beforeEach, describe, expect, it, vi } from "vitest";
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
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

function venue(id: string, name: string, busyness: number | null = null) {
  return {
    id,
    place_id: `place-${id}`,
    zone_id: "south-end-charlotte",
    name,
    address: "South End",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    hidden: false,
    photo_url: `https://example.com/${id}.jpg`,
    open_now: true,
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/venues/trending", () => {
  it("returns the top 5 visible launch-zone venues sorted by busyness descending with public cache headers", async () => {
    const query = chain({
      data: [
        venue("venue-a", "Alpha", 20),
        venue("venue-b", "Beta", 80),
        venue("venue-c", "Charlie", 50),
        venue("venue-d", "Delta", 96),
        venue("venue-e", "Echo", null),
        venue("venue-f", "Foxtrot", 70),
        venue("venue-g", "Gamma", 88),
      ],
    });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=120, stale-while-revalidate=300");
    expect(json.status).toBe("success");
    expect(json.data.venues.map((item: { id: string }) => item.id)).toEqual([
      "venue-d",
      "venue-g",
      "venue-b",
      "venue-f",
      "venue-c",
    ]);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "venues");
    expect(query.eq).toHaveBeenCalledWith("hidden", false);
    expect(query.eq).toHaveBeenCalledWith("zone_id", "south-end-charlotte");
  });

  it("returns an empty list when there are no busyness signals", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [venue("venue-a", "Alpha"), venue("venue-b", "Beta")] }));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.venues).toEqual([]);
  });

  it("returns DB_ERROR when venues cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "venues unavailable" } }));

    const { GET } = await import("../venues/trending/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/trending"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });
});
