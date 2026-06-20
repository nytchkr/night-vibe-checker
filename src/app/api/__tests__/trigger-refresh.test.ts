import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefreshOpenNow = vi.fn();
const mockRefreshBusyness = vi.fn();

vi.mock("@/app/api/cron/refresh-open-now/route", () => ({
  POST: mockRefreshOpenNow,
}));

vi.mock("@/app/api/cron/refresh-busyness/route", () => ({
  POST: mockRefreshBusyness,
}));

function request(secret?: string) {
  return new NextRequest("http://localhost/api/admin/trigger-refresh", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : undefined,
  });
}

describe("POST /api/admin/trigger-refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockRefreshOpenNow.mockResolvedValue(NextResponse.json({ status: "success" }));
    mockRefreshBusyness.mockResolvedValue(NextResponse.json({ status: "success" }));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("requires the cron secret header", async () => {
    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("wrong-secret"));

    expect(res.status).toBe(401);
    expect(mockRefreshOpenNow).not.toHaveBeenCalled();
    expect(mockRefreshBusyness).not.toHaveBeenCalled();
  });

  it("triggers open-now and busyness refreshes with the cron secret", async () => {
    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.triggered).toEqual(["open-now", "busyness"]);
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockRefreshOpenNow).toHaveBeenCalledTimes(1);
    expect(mockRefreshBusyness).toHaveBeenCalledTimes(1);

    const openNowReq = mockRefreshOpenNow.mock.calls[0][0] as NextRequest;
    const busynessReq = mockRefreshBusyness.mock.calls[0][0] as NextRequest;
    expect(openNowReq.headers.get("x-cron-secret")).toBe("test-secret");
    expect(busynessReq.headers.get("x-cron-secret")).toBe("test-secret");
  });

  it("returns a trigger failure when a refresh endpoint fails", async () => {
    mockRefreshBusyness.mockResolvedValueOnce(
      NextResponse.json({ status: "error", error: { code: "REFRESH_BUSYNESS_FAILED" } }, { status: 500 })
    );

    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("test-secret"));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("TRIGGER_REFRESH_FAILED");
    expect(json.error.message).toContain("busyness refresh failed with HTTP 500");
  });
});
