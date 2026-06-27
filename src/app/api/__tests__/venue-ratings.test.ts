import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

function request(method: string, url: string, body?: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockAuth(userId: string | null) {
  mockGetUser.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: { message: "invalid" } },
  );
}

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnValue(promise),
    maybeSingle: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockAuth("user-123");
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
    mockFrom
      .mockReturnValueOnce(chain({ data: [{ rating: 5 }, { rating: 4 }, { rating: 1 }, { rating: 3 }] }))
      .mockReturnValueOnce(chain({ data: { rating: 4 } }));

    const { GET } = await import("../venue-ratings/route");
    const res = await GET(request("GET", "http://localhost/api/venue-ratings?venue_id=venue-1"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.averageRating).toBe(3.3);
    expect(json.ratingCount).toBe(4);
    expect(json.userRating).toBe(4);
    expect(json.data).toEqual({ averageRating: 3.3, ratingCount: 4, userRating: 4 });
  });

  it("lets guests read counts without a user rating", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [{ rating: 5 }] }));

    const { GET } = await import("../venue-ratings/route");
    const res = await GET(request("GET", "http://localhost/api/venue-ratings?venueId=venue-1", undefined, ""));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ averageRating: 5, ratingCount: 1, userRating: null });
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/venue-ratings", () => {
  it("requires login", async () => {
    mockAuth(null);

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
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects ratings submitted for a different user", async () => {
    const { POST } = await import("../venue-ratings/route");
    const res = await POST(
      request("POST", "http://localhost/api/venue-ratings", { venue_id: "venue-1", user_id: "other-user", rating: 4 }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("upserts the user's venue rating", async () => {
    const upsertChain = chain({ data: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const { POST } = await import("../venue-ratings/route");
    const res = await POST(
      request("POST", "http://localhost/api/venue-ratings", { venue_id: "venue-1", user_id: "user-123", rating: 4 }),
    );

    expect(res.status).toBe(200);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { venue_id: "venue-1", user_id: "user-123", rating: 4 },
      { onConflict: "venue_id,user_id" },
    );
    const json = await res.json();
    expect(json.data).toEqual({ venue_id: "venue-1", user_id: "user-123", rating: 4 });
  });
});
