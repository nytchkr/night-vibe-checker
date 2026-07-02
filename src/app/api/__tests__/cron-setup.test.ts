import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCreateSchedule = vi.fn();

vi.mock("@/lib/qstash", () => ({
  qstash: {
    schedules: {
      create: mockCreateSchedule,
    },
  },
}));

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/setup", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : undefined,
  });
}

describe("POST /api/cron/setup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://nytchkr.com/";
    mockCreateSchedule.mockImplementation(({ scheduleId }) =>
      Promise.resolve({ scheduleId }),
    );
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("rejects requests without the cron secret", async () => {
    const { POST } = await import("../cron/setup/route");
    const res = await POST(request("wrong"));

    expect(res.status).toBe(401);
    expect(mockCreateSchedule).not.toHaveBeenCalled();
  });

  it("registers deterministic QStash schedules for cron jobs", async () => {
    const { POST } = await import("../cron/setup/route");
    const res = await POST(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockCreateSchedule).toHaveBeenCalledWith({
      destination: "https://nytchkr.com/api/cron/besttime-refresh",
      cron: "0 * * * *",
      method: "POST",
      scheduleId: "nytchkr-besttime-refresh",
    });
    expect(mockCreateSchedule).toHaveBeenCalledWith({
      destination: "https://nytchkr.com/api/cron/refresh-open-now",
      cron: "*/30 * * * *",
      method: "POST",
      scheduleId: "nytchkr-open-now-refresh",
    });
    expect(mockCreateSchedule).toHaveBeenCalledTimes(2);
    expect(json).toEqual({
      scheduled: [
        {
          id: "nytchkr-besttime-refresh",
          cron: "0 * * * *",
          url: "https://nytchkr.com/api/cron/besttime-refresh",
        },
        {
          id: "nytchkr-open-now-refresh",
          cron: "*/30 * * * *",
          url: "https://nytchkr.com/api/cron/refresh-open-now",
        },
      ],
    });
  });

  it("returns a configuration error when NEXT_PUBLIC_SITE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const { POST } = await import("../cron/setup/route");
    const res = await POST(request("test-cron-secret"));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("NEXT_PUBLIC_SITE_URL is not set.");
    expect(mockCreateSchedule).not.toHaveBeenCalled();
  });
});
