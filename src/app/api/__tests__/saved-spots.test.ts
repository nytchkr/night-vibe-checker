// NV-018 regression coverage — saved-spots API route tests
// Tests: GET/POST/DELETE auth, idempotent duplicate, DB error handling

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --------------- Supabase mock setup -----------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// --------------- Helpers -----------------------------------

function makeRequest(method: string, body?: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/saved-spots", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mockAuth(userId: string | null) {
  mockGetUser.mockResolvedValue(
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: { message: "invalid" } }
  );
}

function mockDb(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
    insert: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
    delete: vi.fn().mockReturnThis(),
  };
  // Make delete().eq().eq() resolve
  chain.eq.mockReturnValueOnce(chain).mockResolvedValue({ data: null, error: returnError });
  mockFrom.mockReturnValue(chain);
  return chain;
}

// --------------- GET tests ---------------------------------

describe("GET /api/saved-spots", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 with no Authorization header", async () => {
    mockAuth(null);
    const { GET } = await import("../saved-spots/route");
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    mockAuth(null);
    const { GET } = await import("../saved-spots/route");
    const res = await GET(makeRequest("GET", undefined, "bad-token"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty spots for new user", async () => {
    mockAuth("user-123");
    mockDb([]);
    const { GET } = await import("../saved-spots/route");
    const res = await GET(makeRequest("GET", undefined, "valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(Array.isArray(json.data.spots)).toBe(true);
  });
});

// --------------- POST tests --------------------------------

describe("POST /api/saved-spots", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 with no token", async () => {
    mockAuth(null);
    const { POST } = await import("../saved-spots/route");
    const res = await POST(makeRequest("POST", { venueId: "v1", venueName: "Bar" }));
    expect(res.status).toBe(401);
  });

  it("returns 422 on missing venueId", async () => {
    mockAuth("user-123");
    const { POST } = await import("../saved-spots/route");
    const res = await POST(makeRequest("POST", { venueName: "Bar" }, "valid-token"));
    expect(res.status).toBe(422);
  });

  it("returns 200 saved:true on successful insert", async () => {
    mockAuth("user-123");
    mockDb(null);
    const { POST } = await import("../saved-spots/route");
    const res = await POST(makeRequest("POST", { venueId: "v1", venueName: "Test Bar" }, "valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.saved).toBe(true);
  });

  it("returns 200 saved:true on duplicate (idempotent)", async () => {
    mockAuth("user-123");
    mockDb(null, { code: "23505", message: "unique constraint" });
    const { POST } = await import("../saved-spots/route");
    const res = await POST(makeRequest("POST", { venueId: "v1", venueName: "Test Bar" }, "valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.saved).toBe(true);
  });
});

// --------------- DELETE tests ------------------------------

describe("DELETE /api/saved-spots", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 with no token", async () => {
    mockAuth(null);
    const { DELETE } = await import("../saved-spots/route");
    const res = await DELETE(makeRequest("DELETE", { venueId: "v1" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 saved:false on successful delete", async () => {
    mockAuth("user-123");
    mockDb(null);
    const { DELETE } = await import("../saved-spots/route");
    const res = await DELETE(makeRequest("DELETE", { venueId: "v1" }, "valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.saved).toBe(false);
  });
});
