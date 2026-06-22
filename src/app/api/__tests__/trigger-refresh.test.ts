import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefreshOpenNow = vi.fn();

vi.mock("@/app/api/cron/refresh-signals/route", () => ({
  POST: mockRefreshOpenNow,
}));

function request(secret?: string) {
  return new NextRequest("http://localhost/api/admin/trigger-refresh", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("POST /api/admin/trigger-refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockRefreshOpenNow.mockResolvedValue(NextResponse.json({ status: "success" }));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("requires the cron secret header", async () => {
    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("wrong-secret"));

    expect(res.status).toBe(401);
    expect(mockRefreshOpenNow).not.toHaveBeenCalled();
  });

  it("triggers signal refresh with the cron secret", async () => {
    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.triggered).toEqual(["signals"]);
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockRefreshOpenNow).toHaveBeenCalledTimes(1);

    const openNowReq = mockRefreshOpenNow.mock.calls[0][0] as NextRequest;
    expect(openNowReq.headers.get("x-cron-secret")).toBe("test-secret");
  });

  it("returns a trigger failure when a refresh endpoint fails", async () => {
    mockRefreshOpenNow.mockResolvedValueOnce(
      NextResponse.json({ status: "error", error: { code: "REFRESH_OPEN_NOW_FAILED" } }, { status: 500 })
    );

    const { POST } = await import("../admin/trigger-refresh/route");
    const res = await POST(request("test-secret"));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("TRIGGER_REFRESH_FAILED");
    expect(json.error.message).toContain("signals refresh failed with HTTP 500");
  });
});
