import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

function selectChain(result: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function updateChain(result: { error?: unknown } = {}) {
  const promise = Promise.resolve({
    data: null,
    error: result.error ?? null,
  });
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
}

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/refresh-busyness", {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("GET /api/cron/refresh-busyness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.BESTTIME_API_KEY = "test-besttime-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
    delete process.env.BESTTIME_API_KEY;
  });

  it("rejects requests without the Bearer cron secret", async () => {
    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("wrong"));

    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fetches BestTime live data and updates venue cache fields", async () => {
    const updateBuilder = updateChain();
    mockFrom
      .mockReturnValueOnce(
        selectChain({
          data: [
            { id: "venue-1", place_id: "besttime-or-place-id", name: "Night Spot" },
            { id: "venue-2", place_id: null, name: "Missing Place" },
          ],
        })
      )
      .mockReturnValueOnce(updateBuilder);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        analysis: {
          venue_live_busyness: 73.2,
          male_pct: 61,
          female_pct: 39,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ updated: 1, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("venue_id=besttime-or-place-id");
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        busyness_pct: 73,
        crowd_feel: "male",
      })
    );
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", "venue-1");
  });
});
