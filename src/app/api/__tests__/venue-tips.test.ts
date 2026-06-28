import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFetch = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

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

vi.mock("@/lib/upstashRedis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
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
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
  mockAuth("user-123");
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.GOOGLE_PLACES_API_KEY = "test-google-key";
  global.fetch = mockFetch;
});

describe("GET /api/venues/[id]/tips", () => {
  it("returns AI venue tips from real Google review text", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: {
          reviews: [
            { text: "Great cocktails and an upbeat crowd after work." },
            { text: "The patio is best before it gets packed late." },
            { text: "The DJ plays throwbacks on Fridays." },
            { text: "Bartenders are fast even when the line is long." },
            { text: "Best seats are by the front windows." },
            { text: "Sixth review should not be sent." },
          ],
        },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "1. Best for after-work cocktails.\n2. Try the patio before it gets packed late." }],
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(venueChain.select).toHaveBeenCalledWith("id, place_id, name, category, hidden");
    expect(res.headers.get("Cache-Control")).toBe("s-maxage=3600, stale-while-revalidate=86400");
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://maps.googleapis.com/maps/api/place/details/json?place_id=google-place-1&fields=reviews&key=test-google-key",
      { cache: "no-store" },
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-anthropic-key",
        }),
      }),
    );
    const anthropicBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(anthropicBody.model).toBe("claude-haiku-4-5-20251001");
    expect(anthropicBody.messages[0].content).toContain("Night Spot");
    expect(anthropicBody.messages[0].content).toContain("Only use what is in the reviews.");
    expect(anthropicBody.messages[0].content).toContain("Great cocktails and an upbeat crowd after work.");
    expect(anthropicBody.messages[0].content).not.toContain("Sixth review should not be sent.");
    expect(anthropicBody.messages[0].content).not.toContain("check-in");
    const json = await res.json();
    expect(json.tips).toHaveLength(2);
    for (const tip of json.tips) {
      expect(typeof tip).toBe("string");
      expect(tip.trim().length).toBeGreaterThan(0);
    }
    expect(json.tips).toEqual(["Best for after-work cocktails.", "Try the patio before it gets packed late."]);
    expect(mockRedisGet).toHaveBeenCalledWith("nv:tips:venue-uuid");
    expect(mockRedisSet).toHaveBeenCalledWith(
      "nv:tips:venue-uuid",
      { tips: ["Best for after-work cocktails.", "Try the patio before it gets packed late."] },
      { ex: 3600 },
    );
  });

  it("returns cached AI tips without calling Anthropic", async () => {
    mockRedisGet.mockResolvedValue({ tips: ["Cached door moves fast before 10."] });
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith("nv:tips:venue-uuid");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ tips: ["Cached door moves fast before 10."] });
  });

  it("falls through to Anthropic when Redis get fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockRedisGet.mockRejectedValue(new Error("redis unavailable"));
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: { reviews: [{ text: "Small dance floor, strong drinks, and a late crowd." }] },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "1. Go for strong drinks and a late dance crowd." }],
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith("nv:tips:venue-uuid");
    expect(consoleError).toHaveBeenCalledWith("[venue-tips] Redis get failed:", expect.any(Error));
    expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.any(Object));
    expect(mockRedisSet).toHaveBeenCalledWith(
      "nv:tips:venue-uuid",
      { tips: ["Go for strong drinks and a late dance crowd."] },
      { ex: 3600 },
    );
    expect(await res.json()).toEqual({ tips: ["Go for strong drinks and a late dance crowd."] });
    consoleError.mockRestore();
  });

  it("returns Anthropic tips when Redis set fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockRedisSet.mockRejectedValue(new Error("redis write failed"));
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: { reviews: [{ text: "Gets loud after 11 and works best for groups." }] },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "1. Best for groups who want a loud late stop." }],
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockRedisGet).toHaveBeenCalledWith("nv:tips:venue-uuid");
    expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.any(Object));
    expect(mockRedisSet).toHaveBeenCalledWith(
      "nv:tips:venue-uuid",
      { tips: ["Best for groups who want a loud late stop."] },
      { ex: 3600 },
    );
    expect(consoleError).toHaveBeenCalledWith("[venue-tips] Redis set failed:", expect.any(Error));
    expect(await res.json()).toEqual({ tips: ["Best for groups who want a loud late stop."] });
    consoleError.mockRestore();
  });

  it("returns generic category tips when the Anthropic API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: { reviews: [{ text: "A real customer review." }] },
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      tips: [
        "General bar tip: check current hours before you go.",
        "General bar tip: recent public reviews can help confirm the vibe tonight.",
      ],
    });
  });

  it("returns generic category tips when Anthropic returns an error", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: { reviews: [{ text: "Real review text for the prompt." }] },
      }),
    }).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: { message: "upstream failed" } }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(await res.json()).toEqual({
      tips: [
        "General bar tip: check current hours before you go.",
        "General bar tip: recent public reviews can help confirm the vibe tonight.",
      ],
    });
  });

  it("returns generic category tips when Google has no reviews", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", place_id: "google-place-1", name: "Night Spot", category: "bar", hidden: false } });
    mockFrom.mockReturnValueOnce(venueChain);
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "OK",
        result: { reviews: [] },
      }),
    });

    const { GET } = await import("../venues/[id]/tips/route");
    const res = await GET(request("GET", "http://localhost/api/venues/venue-1/tips"), params());

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json).toEqual({
      tips: [
        "General bar tip: check current hours before you go.",
        "General bar tip: recent public reviews can help confirm the vibe tonight.",
      ],
    });
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
