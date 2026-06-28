import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());
const mockFindVenue = vi.hoisted(() => vi.fn());
const mockRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));
vi.mock("@/lib/venueLookup", () => ({ findVisibleVenueByIdOrPlaceId: mockFindVenue, normalizeVenueLookupId: (v: string) => v }));
vi.mock("@/lib/upstashRateLimit", () => ({ checkRateLimit: mockRateLimit, rateLimitHeaders: () => ({}) }));

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/venues/venue-1/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4 });
  mockFindVenue.mockResolvedValue({ data: { id: "venue-uuid", hidden: false }, error: null });
  mockSql.mockResolvedValue([{ id: "report-1", venue_id: "venue-uuid", reason: "wrong_hours", notes: "Closes earlier than listed.", created_at: "2026-06-21T00:00:00.000Z" }]);
});

describe("POST /api/venues/[id]/report", () => {
  it("validates the report reason", async () => {
    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(request({ reason: "bad_reason" }), params());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("inserts an anonymous venue report", async () => {
    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(request({ reason: "wrong_hours", notes: "Closes earlier than listed." }), params());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(mockSql).toHaveBeenCalled();
  });

  it("returns VENUE_NOT_FOUND when the venue cannot be resolved", async () => {
    mockFindVenue.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(request({ reason: "duplicate" }), params());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
  });
});
