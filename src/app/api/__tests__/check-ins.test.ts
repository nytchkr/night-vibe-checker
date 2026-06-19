// NV-042 — check-ins API route unit tests
// Tests: POST validation, GET summary, GET /me auth

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --------------- Supabase mock setup -----------------------

const mockGetUser = vi.fn();
const mockFrom    = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// --------------- Helpers -----------------------------------

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  token?: string
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mockAuth(userId: string | null) {
  mockGetUser.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: { message: "invalid token" } }
  );
}

type ChainMock = {
  select:  ReturnType<typeof vi.fn>;
  eq:      ReturnType<typeof vi.fn>;
  order:   ReturnType<typeof vi.fn>;
  limit:   ReturnType<typeof vi.fn>;
  insert:  ReturnType<typeof vi.fn>;
  single:  ReturnType<typeof vi.fn>;
};

function mockDbInsert(returnData: unknown, returnError: unknown = null): ChainMock {
  const chain: ChainMock = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
  };
  (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  mockFrom.mockReturnValue(chain);
  return chain;
}

function mockDbSelect(returnData: unknown, returnError: unknown = null): ChainMock {
  const resolved = { data: returnData, error: returnError };
  // order() must be both awaitable (for /me which has no .limit()) and
  // return a chain with .limit() (for routes that do call .limit())
  const orderResult = {
    // thenable — makes `await chain.order(...)` work
    then(resolve: (v: typeof resolved) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(resolved).then(resolve, reject);
    },
    catch(reject: (e: unknown) => unknown) { return Promise.resolve(resolved).catch(reject); },
    // chainable — makes `.order(...).limit(n)` work
    limit: vi.fn().mockResolvedValue(resolved),
  };
  const chain: ChainMock = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnValue(orderResult),
    limit:  vi.fn().mockResolvedValue(resolved),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

const VALID_POST_BODY = {
  venueId:    "place_abc123",
  venueName:  "The Blue Room",
  crowdLevel: "packed",
  vibeScore:  8.5,
  musicType:  "house",
  waitMinutes: 15,
  tags:       ["dark", "loud"],
  note:       "Great night!",
  sessionId:  "sess-001",
};

const SAMPLE_ROW = {
  id:           "row-uuid-1",
  venue_id:     "place_abc123",
  venue_name:   "The Blue Room",
  crowd_level:  "packed",
  vibe_score:   8.5,
  music_type:   "house",
  wait_minutes: 15,
  tags:         ["dark", "loud"],
  note:         "Great night!",
  user_id:      null,
  session_id:   "sess-001",
  created_at:   "2026-06-19T01:00:00.000Z",
};

// ===================== POST /api/check-ins =====================

describe("POST /api/check-ins", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("returns 201 with checkIn on valid body", async () => {
    mockAuth(null); // anonymous
    mockDbInsert(SAMPLE_ROW);
    const { POST } = await import("../check-ins/route");
    const res = await POST(
      makeRequest("POST", "http://localhost/api/check-ins", VALID_POST_BODY)
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(json.data.checkIn.venueId).toBe("place_abc123");
    expect(json.data.checkIn.crowdLevel).toBe("packed");
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const { POST } = await import("../check-ins/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_JSON");
  });

  it("returns 422 on missing venueId", async () => {
    const { POST } = await import("../check-ins/route");
    const body = { ...VALID_POST_BODY };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).venueId;
    const res = await POST(
      makeRequest("POST", "http://localhost/api/check-ins", body)
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 on invalid crowdLevel", async () => {
    const { POST } = await import("../check-ins/route");
    const res = await POST(
      makeRequest("POST", "http://localhost/api/check-ins", {
        ...VALID_POST_BODY,
        crowdLevel: "chaotic", // not in enum
      })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 on vibeScore out of range", async () => {
    const { POST } = await import("../check-ins/route");
    const res = await POST(
      makeRequest("POST", "http://localhost/api/check-ins", {
        ...VALID_POST_BODY,
        vibeScore: 11.0,
      })
    );
    expect(res.status).toBe(422);
  });

  it("accepts anonymous POST (no auth header)", async () => {
    mockAuth(null);
    mockDbInsert(SAMPLE_ROW);
    const { POST } = await import("../check-ins/route");
    const res = await POST(
      makeRequest("POST", "http://localhost/api/check-ins", VALID_POST_BODY)
      // no token
    );
    expect(res.status).toBe(201);
  });
});

// ===================== GET /api/check-ins =====================

describe("GET /api/check-ins", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("returns 200 with checkIns and summary for a venue", async () => {
    mockDbSelect([SAMPLE_ROW, { ...SAMPLE_ROW, id: "row-uuid-2", vibe_score: 7.0, crowd_level: "moderate" }]);
    const { GET } = await import("../check-ins/route");
    const req = new NextRequest("http://localhost/api/check-ins?venueId=place_abc123");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(Array.isArray(json.data.checkIns)).toBe(true);
    expect(json.data.checkIns).toHaveLength(2);
    expect(json.data.summary).toBeDefined();
    expect(typeof json.data.summary.avgVibeScore).toBe("number");
    expect(json.data.summary.reportCount).toBe(2);
    expect(json.data.summary.venueId).toBe("place_abc123");
  });

  it("returns 400 when venueId is missing", async () => {
    const { GET } = await import("../check-ins/route");
    const req = new NextRequest("http://localhost/api/check-ins");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("MISSING_PARAM");
  });

  it("returns 200 with empty checkIns and zero summary for unknown venue", async () => {
    mockDbSelect([]);
    const { GET } = await import("../check-ins/route");
    const req = new NextRequest("http://localhost/api/check-ins?venueId=unknown_venue");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.checkIns).toHaveLength(0);
    expect(json.data.summary.reportCount).toBe(0);
    expect(json.data.summary.avgVibeScore).toBe(0);
  });

  it("computes dominantCrowd correctly", async () => {
    mockDbSelect([
      { ...SAMPLE_ROW, crowd_level: "packed" },
      { ...SAMPLE_ROW, crowd_level: "packed" },
      { ...SAMPLE_ROW, crowd_level: "quiet" },
    ]);
    const { GET } = await import("../check-ins/route");
    const req = new NextRequest("http://localhost/api/check-ins?venueId=place_abc123");
    const res = await GET(req);
    const json = await res.json();
    expect(json.data.summary.dominantCrowd).toBe("packed");
  });
});

// ===================== GET /api/check-ins/me =====================

describe("GET /api/check-ins/me", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("returns 401 when no Authorization header", async () => {
    mockAuth(null);
    const { GET } = await import("../check-ins/me/route");
    const req = new NextRequest("http://localhost/api/check-ins/me");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    mockAuth(null);
    const { GET } = await import("../check-ins/me/route");
    const req = makeRequest("GET", "http://localhost/api/check-ins/me", undefined, "bad-token");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with user check-ins when authenticated", async () => {
    mockAuth("user-xyz");
    mockDbSelect([{ ...SAMPLE_ROW, user_id: "user-xyz" }]);
    const { GET } = await import("../check-ins/me/route");
    const req = makeRequest("GET", "http://localhost/api/check-ins/me", undefined, "valid-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(Array.isArray(json.data.checkIns)).toBe(true);
    expect(json.data.checkIns[0].userId).toBe("user-xyz");
  });

  it("returns 200 with empty array when user has no check-ins", async () => {
    mockAuth("user-new");
    mockDbSelect([]);
    const { GET } = await import("../check-ins/me/route");
    const req = makeRequest("GET", "http://localhost/api/check-ins/me", undefined, "valid-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.checkIns).toHaveLength(0);
  });
});
