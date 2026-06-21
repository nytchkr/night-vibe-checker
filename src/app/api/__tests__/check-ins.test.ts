import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockRecomputeVenueSignal = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: { from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser } },
}));

vi.mock("@/lib/signals", () => ({
  recomputeVenueSignal: mockRecomputeVenueSignal,
}));

function request(method: string, url: string, body?: unknown, token = "token", extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
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
      : { data: { user: null }, error: { message: "invalid" } }
  );
}

function chain(resolved: { data?: unknown; error?: unknown; count?: number }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
    count: resolved.count,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
    maybeSingle: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

const VENUE = {
  id: "00000000-0000-0000-0000-000000000123",
  place_id: "place-123",
  hidden: false,
};

const CHECK_IN = {
  id: "check-1",
  venue_id: VENUE.id,
  place_id: "place-123",
  venues: { name: "Trio" },
  busyness: "packed",
  crowd_feel: "mostly_male",
  reporter_gender: "female",
  gender_self_report: "f",
  note: "Line is moving",
  created_at: "2026-06-19T01:00:00.000Z",
};

const SIGNAL = {
  venue_id: VENUE.id,
  place_id: "place-123",
  busyness_0_100: 90,
  busyness_source: "crowd",
  mf_ratio: 80,
  confidence_0_1: 0.45,
  sample_size: 2.5,
  computed_at: "2026-06-19T01:01:00.000Z",
  last_busyness_refresh: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockAuth("user-123");
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockRecomputeVenueSignal.mockResolvedValue(SIGNAL);
});

describe("POST /api/check-ins", () => {
  it("requires login", async () => {
    mockAuth(null);
    const { POST } = await import("../check-ins/route");
    const res = await POST(request("POST", "http://localhost/api/check-ins", {}, ""));
    expect(res.status).toBe(401);
  });

  it("validates the new report payload", async () => {
    const { POST } = await import("../check-ins/route");
    const res = await POST(request("POST", "http://localhost/api/check-ins", { venueId: "v", busyness: "wild" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("inserts an authenticated report and returns the recomputed signal", async () => {
    const venueChain = chain({ data: VENUE });
    const duplicateChain = chain({ data: [] });
    const profileChain = chain({ data: { gender: "female" } });
    const insertChain = chain({ data: CHECK_IN });
    mockFrom
      .mockReturnValueOnce(venueChain)
      .mockReturnValueOnce(duplicateChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(insertChain);

    const { POST } = await import("../check-ins/route");
    const res = await POST(
      request("POST", "http://localhost/api/check-ins", {
        venueId: VENUE.id,
        busyness: "packed",
        crowdFeel: "mostly_male",
        note: "Line is moving",
        genderSelfReport: "f",
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.checkIn.busyness).toBe("packed");
    expect(json.data.checkIn.crowdFeel).toBe("mostly_male");
    expect(json.data.signal.busyness0To100).toBe(90);
    expect(profileChain.select).toHaveBeenCalledWith("gender");
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        reporter_gender: "female",
        gender_self_report: "f",
      })
    );
    expect(mockRecomputeVenueSignal).toHaveBeenCalledWith(VENUE.id);
  });

  it("stores null reporter gender when profile gender is undisclosed", async () => {
    const venueChain = chain({ data: VENUE });
    const duplicateChain = chain({ data: [] });
    const profileChain = chain({ data: { gender: "undisclosed" } });
    const insertChain = chain({ data: { ...CHECK_IN, reporter_gender: null } });
    mockFrom
      .mockReturnValueOnce(venueChain)
      .mockReturnValueOnce(duplicateChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(insertChain);

    const { POST } = await import("../check-ins/route");
    const res = await POST(
      request("POST", "http://localhost/api/check-ins", {
        venueId: VENUE.id,
        busyness: "packed",
        crowdFeel: "mostly_male",
      })
    );

    expect(res.status).toBe(201);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        reporter_gender: null,
        gender_self_report: null,
      })
    );
  });

  it("stores null gender self-report when the user skips", async () => {
    const venueChain = chain({ data: VENUE });
    const duplicateChain = chain({ data: [] });
    const profileChain = chain({ data: { gender: "female" } });
    const insertChain = chain({ data: { ...CHECK_IN, gender_self_report: null } });
    mockFrom
      .mockReturnValueOnce(venueChain)
      .mockReturnValueOnce(duplicateChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(insertChain);

    const { POST } = await import("../check-ins/route");
    const res = await POST(
      request("POST", "http://localhost/api/check-ins", {
        venueId: VENUE.id,
        busyness: "packed",
        crowdFeel: "mostly_male",
      })
    );

    expect(res.status).toBe(201);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        gender_self_report: null,
      })
    );
  });

  it("ensures the gender self-report column and retries when Supabase schema cache is stale", async () => {
    const venueChain = chain({ data: VENUE });
    const duplicateChain = chain({ data: [] });
    const profileChain = chain({ data: { gender: "female" } });
    const missingColumnChain = chain({
      error: {
        code: "PGRST204",
        message: "Could not find the 'gender_self_report' column of 'check_ins' in the schema cache",
      },
    });
    const retryInsertChain = chain({ data: CHECK_IN });
    mockFrom
      .mockReturnValueOnce(venueChain)
      .mockReturnValueOnce(duplicateChain)
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(missingColumnChain)
      .mockReturnValueOnce(retryInsertChain);

    const { POST } = await import("../check-ins/route");
    const res = await POST(
      request("POST", "http://localhost/api/check-ins", {
        venueId: VENUE.id,
        busyness: "packed",
        crowdFeel: "mostly_male",
        genderSelfReport: "f",
      })
    );

    expect(res.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("ensure_check_ins_gender_self_report_column");
    expect(retryInsertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        gender_self_report: "f",
      })
    );
  });

  it("inserts reporter gender on venue-scoped check-ins", async () => {
    const venueChain = chain({ data: VENUE });
    const profileChain = chain({ data: { gender: "male" } });
    const insertChain = chain({ data: { ...CHECK_IN, reporter_gender: "male" } });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(profileChain).mockReturnValueOnce(insertChain);

    const { POST } = await import("../venues/[id]/check-in/route");
    const res = await POST(
      request("POST", `http://localhost/api/venues/${VENUE.id}/check-in`, {
        busyness: "moderate",
        crowd_feel: "balanced",
        gender_self_report: "m",
      }),
      { params: Promise.resolve({ id: VENUE.id }) }
    );

    expect(res.status).toBe(201);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        reporter_gender: "male",
        gender_self_report: "m",
      })
    );
    expect(mockRecomputeVenueSignal).toHaveBeenCalledWith(VENUE.id);
  });

  it("rate limits duplicate reports by user and venue", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: VENUE })).mockReturnValueOnce(chain({ data: [{ id: "recent" }] }));
    const { POST } = await import("../check-ins/route");
    const res = await POST(
      request("POST", "http://localhost/api/check-ins", {
        venueId: VENUE.id,
        busyness: "moderate",
        crowdFeel: "balanced",
      })
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(json.error.message).toBe("You already reported this venue recently. Try again in a few minutes.");
  });

  it("rate limits authenticated check-in attempts by IP", async () => {
    const { POST } = await import("../check-ins/route");
    const body = { venueId: "v", busyness: "wild" };

    for (let i = 0; i < 10; i += 1) {
      const res = await POST(
        request("POST", "http://localhost/api/check-ins", body, "token", { "x-forwarded-for": "203.0.113.10" })
      );
      expect(res.status).toBe(422);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    }

    const res = await POST(
      request("POST", "http://localhost/api/check-ins", body, "token", { "x-forwarded-for": "203.0.113.10" })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/check-ins", () => {
  it("returns a clear 503 when Supabase env is missing", async () => {
    mockAssertSupabaseServerEnv.mockImplementationOnce(() => {
      throw new MockMissingSupabaseEnvError("NEXT_PUBLIC_SUPABASE_URL");
    });

    const { GET } = await import("../check-ins/route");
    const res = await GET(new NextRequest("http://localhost/api/check-ins"));

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("MISSING_ENV");
    expect(json.error.message).toBe("Missing NEXT_PUBLIC_SUPABASE_URL — add to .env.local");
  });

  it("returns recent public feed reports", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [CHECK_IN] }));
    const { GET } = await import("../check-ins/route");
    const res = await GET(new NextRequest("http://localhost/api/check-ins"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.checkIns[0].crowdFeel).toBe("mostly_male");
  });

  it("returns venue reports and signal summary", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: VENUE }))
      .mockReturnValueOnce(chain({ data: [CHECK_IN] }))
      .mockReturnValueOnce(chain({ data: SIGNAL }));
    const { GET } = await import("../check-ins/route");
    const res = await GET(new NextRequest(`http://localhost/api/check-ins?venueId=${VENUE.id}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.summary.busyness0To100).toBe(90);
    expect(json.data.summary.mfRatio).toBe(80);
  });
});

describe("GET /api/check-ins/me", () => {
  it("returns the authenticated user's own reports", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [CHECK_IN], count: 12 }));
    const { GET } = await import("../check-ins/me/route");
    const res = await GET(request("GET", "http://localhost/api/check-ins/me"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.checkIns[0].busyness).toBe("packed");
    expect(json.data.checkIns[0].venueName).toBe("Trio");
    expect(json.data.totalCheckIns).toBe(12);
  });
});
