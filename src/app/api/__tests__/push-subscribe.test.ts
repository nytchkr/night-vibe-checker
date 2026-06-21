import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

function request(body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

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
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
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
    expect(json.error).toBe("endpoint, keys.auth, and keys.p256dh are required.");
  });

  it("upserts the subscription by endpoint", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request(SUBSCRIPTION));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        endpoint: SUBSCRIPTION.endpoint,
        auth: SUBSCRIPTION.keys.auth,
        p256dh: SUBSCRIPTION.keys.p256dh,
        created_at: expect.any(String),
      }),
      { onConflict: "endpoint" },
    );
  });
});
