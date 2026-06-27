import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAssertSupabaseServerEnv = vi.fn();
const mockFrom = vi.fn();
const mockLogCronRun = vi.fn();
const mockSetVapidDetails = vi.fn();
const mockSendNotification = vi.fn();

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

vi.mock("@/lib/cronHealth", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  logCronRun: mockLogCronRun,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

function request(secret = "test-cron-secret") {
  return new NextRequest("http://localhost/api/cron/notify-busy-venues", {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });
}

function selectEqResult(data: unknown, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data, error }),
    }),
  };
}

function venuesQuery(data: unknown, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      gte: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

function recentNotificationQuery(data: unknown, error = null) {
  const query: {
    eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    gte: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);

  return {
    select: vi.fn(() => query),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.VAPID_EMAIL = "mailto:ops@example.test";
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockLogCronRun.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VAPID_EMAIL;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("GET /api/cron/notify-busy-venues", () => {
  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("../cron/notify-busy-venues/route");
    const res = await GET(request("wrong"));

    expect(res.status).toBe(401);
    expect(mockAssertSupabaseServerEnv).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends push notifications once per saved user and records the send", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const notifications = recentNotificationQuery([]);
    notifications.insert = insert;

    mockFrom.mockImplementation((table: string) => {
      if (table === "venues") {
        return venuesQuery([
          { id: "venue-1", name: "Trio", current_popularity: 82 },
        ]);
      }
      if (table === "saved_venues") {
        return selectEqResult([
          { user_id: "user-1", venue_id: "venue-1", alert_threshold: 70 },
        ]);
      }
      if (table === "notifications_sent") {
        return notifications;
      }
      if (table === "push_subscriptions") {
        return selectEqResult([
          {
            endpoint: "https://push.example/sub",
            p256dh: "p256dh",
            auth: "auth",
          },
        ]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { GET } = await import("../cron/notify-busy-venues/route");
    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:ops@example.test",
      "public-key",
      "private-key",
    );
    expect(mockSendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/sub",
        keys: { p256dh: "p256dh", auth: "auth" },
      },
      expect.stringContaining('"venueId":"venue-1"'),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        venue_id: "venue-1",
        notification_type: "busy_venue",
      }),
    );
    expect(json).toMatchObject({
      notified: 1,
      pushSent: 1,
      skippedRecent: 0,
      errors: 0,
    });
  });

  it("skips users notified in the last four hours", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "venues") {
        return venuesQuery([
          { id: "venue-1", name: "Trio", current_popularity: 88 },
        ]);
      }
      if (table === "saved_venues") {
        return selectEqResult([
          { user_id: "user-1", venue_id: "venue-1", alert_threshold: 70 },
        ]);
      }
      if (table === "notifications_sent") {
        return recentNotificationQuery([{ id: "sent-1" }]);
      }
      if (table === "push_subscriptions") {
        return selectEqResult([
          {
            endpoint: "https://push.example/sub",
            p256dh: "p256dh",
            auth: "auth",
          },
        ]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { GET } = await import("../cron/notify-busy-venues/route");
    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(json).toMatchObject({
      notified: 0,
      pushSent: 0,
      skippedRecent: 1,
      errors: 0,
    });
  });
});
