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
    expect(refreshBusynessMock).toHaveBeenCalledWith(50);
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
    expect(refreshBusynessMock).toHaveBeenCalledWith(50);
    expect(refreshOpenNowMock).toHaveBeenCalled();
    expect(json).toEqual({
      updated: 1,
      errors: [{ venueId: "venue-2", error: "BestTime forecast HTTP 404" }],
      results: [
        { venueId: "venue-1", ok: true },
        { venueId: "venue-2", ok: false, reason: "BestTime forecast HTTP 404" },
      ],
      openNow: { updated: 57 },
    });
  });

  it("returns a 500 when the shared refresh fails", async () => {
    refreshBusynessMock.mockRejectedValue(new Error("BESTTIME_API_KEY is not set."));

    const { GET } = await import("../cron/refresh-busyness/route");
    const res = await GET(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "BESTTIME_API_KEY is not set." });
    expect(refreshOpenNowMock).not.toHaveBeenCalled();
  });
});
