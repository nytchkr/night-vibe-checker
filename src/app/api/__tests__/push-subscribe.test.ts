import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

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
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

function request(body: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const SUBSCRIPTION = {
  endpoint: "https://push.example.test/subscription/123",
  keys: {
    auth: "auth-secret",
    p256dh: "p256dh-key",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
  mockFrom.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) });
});

describe("POST /api/push/subscribe", () => {
  it("requires an authenticated user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid" } });

    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request(SUBSCRIPTION));

    expect(res.status).toBe(401);
  });

  it("validates the push subscription payload", async () => {
    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request({ endpoint: "not-a-url", keys: { auth: "", p256dh: "" } }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("upserts the subscription by endpoint", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request(SUBSCRIPTION));

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-123",
        endpoint: SUBSCRIPTION.endpoint,
        auth: SUBSCRIPTION.keys.auth,
        p256dh: SUBSCRIPTION.keys.p256dh,
      },
      { onConflict: "endpoint" },
    );
  });
});
