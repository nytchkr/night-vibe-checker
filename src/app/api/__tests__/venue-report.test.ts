import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();

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
    from: mockFrom,
  },
}));

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

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
});

describe("POST /api/venues/[id]/report", () => {
  it("validates the report reason", async () => {
    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(request({ reason: "bad_reason" }), params());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("inserts an anonymous venue report", async () => {
    const venueChain = chain({ data: { id: "venue-uuid", hidden: false } });
    const insertChain = chain({
      data: {
        id: "report-1",
        venue_id: "venue-uuid",
        reason: "wrong_hours",
        notes: "Closes earlier than listed.",
        created_at: "2026-06-21T00:00:00.000Z",
      },
    });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(insertChain);

    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(
      request({ reason: "wrong_hours", notes: "Closes earlier than listed." }),
      params(),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "venues");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "venue_reports");
    expect(insertChain.insert).toHaveBeenCalledWith({
      venue_id: "venue-uuid",
      user_id: null,
      reason: "wrong_hours",
      notes: "Closes earlier than listed.",
    });
    expect(json.status).toBe("success");
    expect(json.data.report.id).toBe("report-1");
  });

  it("returns VENUE_NOT_FOUND when the venue cannot be resolved", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "not found" } }));

    const { POST } = await import("../venues/[id]/report/route");
    const res = await POST(request({ reason: "duplicate" }), params());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
  });
});
