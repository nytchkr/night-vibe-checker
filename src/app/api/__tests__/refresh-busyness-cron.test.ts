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
    not: vi.fn().mockReturnThis(),
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
    const selectBuilder = selectChain({
      data: [{ id: "venue-1", besttime_venue_id: "besttime-venue-id", name: "Night Spot" }],
    });
    mockFrom
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        analysis: {
          venue_live_busyness_available: true,
          venue_live_busyness: 73.2,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ updated: 1, errors: [] });
    expect(selectBuilder.not).toHaveBeenCalledWith("besttime_venue_id", "is", null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api_key_private=test-besttime-key");
    expect(String(fetchMock.mock.calls[0][0])).toContain("venue_id=besttime-venue-id");
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        busyness_pct: 73,
        last_busyness_refresh: expect.any(String),
      })
    );
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", "venue-1");
  });

  it("logs BestTime errors and continues to the next venue", async () => {
    const updateBuilder = updateChain();
    mockFrom
      .mockReturnValueOnce(
        selectChain({
          data: [
            { id: "venue-1", besttime_venue_id: "besttime-unavailable", name: "Closed Spot" },
            { id: "venue-2", besttime_venue_id: "besttime-live", name: "Live Spot" },
          ],
        })
      )
      .mockReturnValueOnce(updateBuilder);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis: {
            venue_live_busyness_available: false,
            venue_live_busyness: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          analysis: {
            venue_live_busyness_available: true,
            venue_live_busyness: 41,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.updated).toBe(1);
    expect(json.errors).toEqual([
      expect.objectContaining({
        venueId: "venue-1",
        bestTimeVenueId: "besttime-unavailable",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to refresh BestTime busyness"));
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", "venue-2");
  });
});
