import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} - add to .env.local`);
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

function request(body: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/venues/venue-1/rate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
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
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

const params = { params: Promise.resolve({ id: "venue-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
});

describe("POST /api/venues/[id]/rate", () => {
  it("requires an authenticated Supabase session", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid" } });

    const { POST } = await import("../venues/[id]/rate/route");
    const res = await POST(request({ rating: 4 }, "bad-token"), params);

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
    const upsertChain = chain({ data: null });
    const averageChain = chain({ data: [{ rating: 5 }, { rating: 4 }, { rating: 2 }] });
    mockFrom.mockReturnValueOnce(upsertChain).mockReturnValueOnce(averageChain);

    const { POST } = await import("../venues/[id]/rate/route");
    const res = await POST(request({ rating: 4 }), params);

    expect(res.status).toBe(200);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { venue_id: "venue-1", user_id: "user-123", rating: 4 },
      { onConflict: "venue_id,user_id" },
    );
    expect(averageChain.select).toHaveBeenCalledWith("rating");
    expect(averageChain.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.avg_rating).toBe(3.7);
    expect(json.data).toEqual({ ok: true, avg_rating: 3.7 });
  });
});
