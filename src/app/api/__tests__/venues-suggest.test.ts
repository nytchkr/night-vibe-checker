import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(promise),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/venues/suggest", () => {
  it("requires q with at least 2 characters", async () => {
    const { GET } = await import("../venues/suggest/route");

    const missing = await GET(new NextRequest("http://localhost/api/venues/suggest"));
    const tooShort = await GET(new NextRequest("http://localhost/api/venues/suggest?q=a"));

    expect(missing.status).toBe(400);
    expect(tooShort.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns up to five visible venue name suggestions", async () => {
    const query = chain({
      data: [
        { id: "venue-a", name: "Neon Lounge", category: "lounge", zone_id: "south-end-charlotte" },
        { id: "venue-b", name: "Neon Garden", category: "bar", zone_id: "dilworth-charlotte" },
      ],
    });
    mockFrom.mockReturnValueOnce(query);

    const { GET } = await import("../venues/suggest/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/suggest?q= neon "));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=60");
    expect(mockFrom).toHaveBeenCalledWith("venues");
    expect(query.select).toHaveBeenCalledWith("id, name, category, zone_id");
    expect(query.ilike).toHaveBeenCalledWith("name", "%neon%");
    expect(query.eq).toHaveBeenCalledWith("hidden", false);
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(json).toEqual({
      suggestions: [
        { id: "venue-a", name: "Neon Lounge", category: "lounge", zoneId: "south-end-charlotte" },
        { id: "venue-b", name: "Neon Garden", category: "bar", zoneId: "dilworth-charlotte" },
      ],
    });
  });

  it("returns DB_ERROR when suggestions cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: new Error("database unavailable") }));

    const { GET } = await import("../venues/suggest/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/suggest?q=neon"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });
});
