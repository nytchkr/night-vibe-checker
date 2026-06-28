import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ sql: mockSql }));

function request(method: string, url: string, body?: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  mockSql.mockResolvedValue([]);
});

describe("GET /api/venue-ratings", () => {
  it("requires a venueId query parameter", async () => {
    const { GET } = await import("../venue-ratings/route");
    const res = await GET(new NextRequest("http://localhost/api/venue-ratings"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns aggregate counts and the authenticated user's rating", async () => {
    mockSql
      .mockResolvedValueOnce([{ rating: 5 }, { rating: 4 }, { rating: 1 }, { rating: 3 }])
      .mockResolvedValueOnce([{ rating: 4 }]);

    const { GET } = await import("../venue-ratings/route");
    const res = await GET(request("GET", "http://localhost/api/venue-ratings?venue_id=venue-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.averageRating).toBe(3.3);
    expect(json.ratingCount).toBe(4);
    expect(json.userRating).toBe(4);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("lets guests read counts without a user rating", async () => {
    mockAuth.mockResolvedValue(null);
    mockSql.mockResolvedValueOnce([{ rating: 5 }]);

    const { GET } = await import("../venue-ratings/route");
    const res = await GET(request("GET", "http://localhost/api/venue-ratings?venueId=venue-1", undefined, ""));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ averageRating: 5, ratingCount: 1, userRating: null });
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=30, stale-while-revalidate=60");
  });
});

describe("POST /api/venue-ratings", () => {
  it("requires login", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", {}, "bad-token"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("validates the rating payload", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", { venue_id: "venue-1", rating: 6 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "Invalid rating. Must be 1-5." });
  });

  it("requires a venue_id in the rating payload", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", { rating: 4 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "venue_id is required." });
  });

  it("rejects ratings submitted for a different user", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", { venue_id: "venue-1", user_id: "other-user", rating: 4 }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("upserts the user's venue rating", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", { venue_id: "venue-1", user_id: "user-123", rating: 4 }));
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalled();
    const json = await res.json();
    expect(json.data).toEqual({ venue_id: "venue-1", user_id: "user-123", rating: 4 });
  });

  it("strips non-allowlist characters from submitted identifiers", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(request("POST", "http://localhost/api/venue-ratings", {
      venue_id: "venue-1'; DROP TABLE ratings;--",
      user_id: "user-123",
      rating: 5,
    }));
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalled();
  });
});
