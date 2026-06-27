import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const refreshBusynessMock = vi.fn();
const refreshOpenNowMock = vi.fn();

vi.mock("@/lib/besttime", () => ({
  refreshBusyness: refreshBusynessMock,
}));

vi.mock("@/lib/openNow", () => ({
  refreshOpenNow: refreshOpenNowMock,
}));

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/refresh-busyness", {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

function requestWithCronHeader(secret: string) {
  return new NextRequest("http://localhost/api/cron/refresh-busyness", {
    method: "GET",
    headers: { "x-cron-secret": secret },
  });
}

describe("GET /api/cron/refresh-busyness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests without the Bearer cron secret", async () => {
    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("wrong"));

    expect(res.status).toBe(401);
    expect(refreshBusynessMock).not.toHaveBeenCalled();
    expect(refreshOpenNowMock).not.toHaveBeenCalled();
  });

  it("accepts the explicit x-cron-secret header", async () => {
    refreshBusynessMock.mockResolvedValue([]);
    refreshOpenNowMock.mockResolvedValue({ updated: 0 });

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(requestWithCronHeader("test-cron-secret"));

    expect(res.status).toBe(200);
    expect(refreshBusynessMock).toHaveBeenCalledWith();
  });

  it("refreshes busyness through the shared BestTime adapter", async () => {
    refreshBusynessMock.mockResolvedValue([
      { venueId: "venue-1", ok: true },
      { venueId: "venue-2", ok: false, reason: "BestTime forecast HTTP 404" },
    ]);
    refreshOpenNowMock.mockResolvedValue({ updated: 57 });

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(refreshBusynessMock).toHaveBeenCalledWith();
    expect(refreshOpenNowMock).toHaveBeenCalled();
    expect(json).toEqual({
      updated: 1,
      errors: [{ venueId: "venue-2", error: "BestTime forecast HTTP 404" }],
      results: [
        { venueId: "venue-1", ok: true },
        { venueId: "venue-2", ok: false, reason: "BestTime forecast HTTP 404" },
      ],
      openNow: { updated: 57 },
      busyError: null,
      openNowError: null,
    });
  });

  it("returns 200 with busyError when refreshBusyness throws, still calls refreshOpenNow", async () => {
    refreshBusynessMock.mockRejectedValue(new Error("BESTTIME_API_KEY is not set."));
    refreshOpenNowMock.mockResolvedValue({ updated: 12 });

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.busyError).toBe("BESTTIME_API_KEY is not set.");
    expect(json.openNowError).toBeNull();
    expect(json.openNow).toEqual({ updated: 12 });
    expect(json.updated).toBe(0);
    expect(refreshOpenNowMock).toHaveBeenCalled();
  });

  it("returns 200 with openNowError when refreshOpenNow throws", async () => {
    refreshBusynessMock.mockResolvedValue([{ venueId: "venue-1", ok: true }]);
    refreshOpenNowMock.mockRejectedValue(new Error("refreshOpenNow fetch failed: {}"));

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.busyError).toBeNull();
    expect(json.openNowError).toBe("refreshOpenNow fetch failed: {}");
    expect(json.openNow).toBeNull();
    expect(json.updated).toBe(1);
  });
});
