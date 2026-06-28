import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
});

describe("GET /api/venues/suggest", () => {
  it("requires q with at least 2 characters", async () => {
    const { GET } = await import("../venues/suggest/route");

    const missing = await GET(new NextRequest("http://localhost/api/venues/suggest"));
    const tooShort = await GET(new NextRequest("http://localhost/api/venues/suggest?q=a"));

    expect(missing.status).toBe(400);
    expect(tooShort.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns up to five visible venue name suggestions", async () => {
    mockSql.mockResolvedValueOnce([
      { id: "venue-a", name: "Neon Lounge", category: "lounge", zone_id: "south-end-charlotte" },
      { id: "venue-b", name: "Neon Garden", category: "bar", zone_id: "dilworth-charlotte" },
    ]);

    const { GET } = await import("../venues/suggest/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/suggest?q= neon "));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=60");
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(json).toEqual({
      suggestions: [
        { id: "venue-a", name: "Neon Lounge", category: "lounge", zoneId: "south-end-charlotte" },
        { id: "venue-b", name: "Neon Garden", category: "bar", zoneId: "dilworth-charlotte" },
      ],
    });
  });

  it("returns DB_ERROR when suggestions cannot be loaded", async () => {
    mockSql.mockRejectedValueOnce(new Error("database unavailable"));

    const { GET } = await import("../venues/suggest/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/suggest?q=neon"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });
});
