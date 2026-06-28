import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ sql: mockSql }));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/venues/venue-1/rate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "venue-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  mockSql.mockResolvedValue([]);
});

describe("POST /api/venues/[id]/rate", () => {
  it("requires an authenticated Supabase session", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("../venues/[id]/rate/route");
    const res = await POST(request({ rating: 4 }), params);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("validates the numeric star rating", async () => {
    const { POST } = await import("../venues/[id]/rate/route");
    const res = await POST(request({ rating: 6 }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("upserts the user's rating and returns the rounded venue average", async () => {
    mockSql
      .mockResolvedValueOnce([]) // upsert
      .mockResolvedValueOnce([{ rating: 5 }, { rating: 4 }, { rating: 2 }]); // average query

    const { POST } = await import("../venues/[id]/rate/route");
    const res = await POST(request({ rating: 4 }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.avg_rating).toBe(3.7);
  });
});
