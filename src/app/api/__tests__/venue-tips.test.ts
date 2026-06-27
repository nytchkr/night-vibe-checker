import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFetch = vi.fn();

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
    rpc: mockRpc,
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

function params(id = "venue-1") {
  return { params: Promise.resolve({ id }) };
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
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
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
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  global.fetch = mockFetch;
});

describe("GET /api/venues/[id]/tips", () => {
  it("returns AI venue tips from recent check-in patterns", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", name: "Night Spot", category: "bar", hidden: false } });
    const checkInsChain = chain({
      data: [
        {
          busyness: "packed",
          created_at: "2026-06-21T00:00:00.000Z",
        },
        {
          busyness: "moderate",
          created_at: "2026-06-21T02:00:00.000Z",
        },
      ],
    });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(checkInsChain);
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "1. Arrive before midnight for easier entry.\n2. Expect packed energy around 8-10pm." }],
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(checkInsChain.select).toHaveBeenCalledWith("busyness, created_at");
    expect(checkInsChain.eq).toHaveBeenCalledWith("venue_id", "venue-uuid");
    expect(checkInsChain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(checkInsChain.limit).toHaveBeenCalledWith(20);
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=3600, stale-while-revalidate=86400");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-anthropic-key",
        }),
      }),
    );
    const anthropicBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(anthropicBody.model).toBe("claude-haiku-4-5-20251001");
    expect(anthropicBody.messages[0].content).toContain("Night Spot");
    const json = await res.json();
    expect(json.tips).toHaveLength(2);
    for (const tip of json.tips) {
      expect(typeof tip).toBe("string");
      expect(tip.trim().length).toBeGreaterThan(0);
    }
    expect(json.tips).toEqual(["Arrive before midnight for easier entry.", "Expect packed energy around 8-10pm."]);
  });

  it("returns empty tips when the Anthropic API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const venueChain = chain({ data: { id: "venue-uuid", name: "Night Spot", category: "bar", hidden: false } });
    const checkInsChain = chain({ data: [{ busyness: "packed", created_at: "2026-06-21T00:00:00.000Z" }] });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(checkInsChain);

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ tips: [] });
  });

  it("returns empty tips when Anthropic returns an error", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", name: "Night Spot", category: "bar", hidden: false } });
    const checkInsChain = chain({ data: [{ busyness: "packed", created_at: "2026-06-21T00:00:00.000Z" }] });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(checkInsChain);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: { message: "upstream failed" } }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(await res.json()).toEqual({ tips: [] });
  });

  it("generates generic tips when the venue has no check-ins", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", name: "Night Spot", category: "bar", hidden: false } });
    const checkInsChain = chain({ data: [] });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(checkInsChain);
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: "1. Check the door policy before you go.\n2. Arrive earlier if you want a quieter first round.\n3. Budget extra time for parking.",
          },
        ],
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
    const anthropicBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(anthropicBody.messages[0].content).toContain("No recent check-ins yet");
    const json = await res.json();
    expect(json.tips).toHaveLength(3);
    for (const tip of json.tips) {
      expect(typeof tip).toBe("string");
      expect(tip.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("POST /api/venues/[id]/tips", () => {
  it("requires login", async () => {
    mockAuth(null);

    const { POST } = await import("../venues/[id]/tips/route");
    const res = await POST(request("POST", "http://localhost/api/venues/venue-1/tips", { tip: "Great spot late." }), params());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("validates tip text", async () => {
    const { POST } = await import("../venues/[id]/tips/route");
    const res = await POST(request("POST", "http://localhost/api/venues/venue-1/tips", { tip_text: "" }), params());

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("inserts an authenticated tip", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", hidden: false } });
    const insertChain = chain({
      data: {
        id: "tip-1",
        venue_id: "venue-uuid",
        user_id: "user-123",
        tip_text: "Go before 10 if you want a shorter line.",
        helpful_count: 0,
        created_at: "2026-06-21T00:00:00.000Z",
      },
    });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(insertChain);

    const { POST } = await import("../venues/[id]/tips/route");
    const res = await POST(
      request("POST", "http://localhost/api/venues/venue-1/tips", {
        tip: "Go before 10 if you want a shorter line.",
      }),
      params(),
    );

    expect(res.status).toBe(201);
    expect(insertChain.insert).toHaveBeenCalledWith({
      venue_id: "venue-uuid",
      user_id: "user-123",
      tip_text: "Go before 10 if you want a shorter line.",
      tip: "Go before 10 if you want a shorter line.",
    });
    const json = await res.json();
    expect(json).toEqual({
      id: "tip-1",
      tip_text: "Go before 10 if you want a shorter line.",
      helpful_count: 0,
      author_initials: "U1",
      created_at: "2026-06-21T00:00:00.000Z",
    });
  });
});

describe("POST /api/tips/[id]/helpful", () => {
  it("increments helpful count without auth", async () => {
    const tipId = "11111111-1111-4111-8111-111111111111";
    mockRpc.mockResolvedValue({
      data: [{ id: tipId, helpful_count: 3 }],
      error: null,
    });

    const { POST } = await import("../tips/[id]/helpful/route");
    const res = await POST(request("POST", `http://localhost/api/tips/${tipId}/helpful`, undefined, ""), params(tipId));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("increment_venue_tip_helpful", { tip_id: tipId });
    const json = await res.json();
    expect(json.data.tip).toEqual({ id: tipId, helpfulCount: 3 });
  });

  it("validates helpful tip ids", async () => {
    const { POST } = await import("../tips/[id]/helpful/route");
    const res = await POST(request("POST", "http://localhost/api/tips/not-a-uuid/helpful", undefined, ""), params("not-a-uuid"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
