import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/venues/[id]/check-ins", () => {
  it("returns the latest public venue check-ins without user identifiers", async () => {
    const venueChain = chain({ data: { id: "venue-123", hidden: false } });
    const checkInsChain = chain({
      data: [
        {
          id: "check-1",
          user_id: "private-user",
          busyness_0_to_100: 83,
          crowd_feel: "Great crowd near the bar",
          gender: "M",
          created_at: "2026-06-21T03:10:00.000Z",
        },
      ],
    });
    mockFrom.mockReturnValueOnce(venueChain).mockReturnValueOnce(checkInsChain);

    const { GET } = await import("../venues/[id]/check-ins/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-123/check-ins"), {
      params: Promise.resolve({ id: "venue-123" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(json).toEqual([
      {
        id: "check-1",
        busynessLevel: 83,
        crowdFeel: "Great crowd near the bar",
        gender: "M",
        createdAt: "2026-06-21T03:10:00.000Z",
      },
    ]);
    expect(JSON.stringify(json)).not.toContain("user_id");
    expect(checkInsChain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(checkInsChain.limit).toHaveBeenCalledWith(10);
  });

  it("falls back to the current repo check_ins schema", async () => {
    const venueChain = chain({ data: { id: "venue-123", hidden: false } });
    const missingColumnChain = chain({
      error: {
        code: "PGRST204",
        message: "Could not find the 'busyness_0_to_100' column of 'check_ins' in the schema cache",
      },
    });
    const fallbackChain = chain({
      data: [
        {
          id: "check-2",
          busyness: "packed",
          note: "Line is quick",
          gender_self_report: "f",
          created_at: "2026-06-21T03:15:00.000Z",
        },
      ],
    });
    mockFrom
      .mockReturnValueOnce(venueChain)
      .mockReturnValueOnce(missingColumnChain)
      .mockReturnValueOnce(fallbackChain);

    const { GET } = await import("../venues/[id]/check-ins/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-123/check-ins"), {
      params: Promise.resolve({ id: "venue-123" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      {
        id: "check-2",
        busynessLevel: 90,
        crowdFeel: "Line is quick",
        gender: "F",
        createdAt: "2026-06-21T03:15:00.000Z",
      },
    ]);
    expect(fallbackChain.select).toHaveBeenCalledWith("id, busyness, note, gender_self_report, created_at");
    expect(fallbackChain.eq).toHaveBeenCalledWith("hidden", false);
  });

  it("returns VENUE_NOT_FOUND when the venue cannot be resolved", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "not found" } }));

    const { GET } = await import("../venues/[id]/check-ins/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/missing/check-ins"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
  });
});
