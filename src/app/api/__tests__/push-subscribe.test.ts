import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthenticatedUserId = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/apiAuth", () => ({
  getAuthenticatedUserId: mockGetAuthenticatedUserId,
}));

vi.mock("@/lib/supabase", () => ({
  MissingSupabaseEnvError: class MissingSupabaseEnvError extends Error {},
  supabaseAdmin: {
    from: mockFrom,
  },
}));

function request(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
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
  mockGetAuthenticatedUserId.mockResolvedValue("user-123");
  mockFrom.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) });
});

describe("POST /api/push/subscribe", () => {
  it("requires an authenticated user", async () => {
    mockGetAuthenticatedUserId.mockResolvedValueOnce(null);

    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request("POST", SUBSCRIPTION));

    expect(res.status).toBe(401);
  });

  it("validates the push subscription payload", async () => {
    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request("POST", { endpoint: "not-a-url", keys: { auth: "", p256dh: "" } }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("endpoint, keys.auth, and keys.p256dh are required.");
  });

  it("upserts the subscription by endpoint", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const { POST } = await import("../push/subscribe/route");
    const res = await POST(request("POST", SUBSCRIPTION));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: { ok: true }, ok: true });
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

describe("DELETE /api/push/subscribe", () => {
  it("removes the current user's subscription endpoint", async () => {
    const eqEndpoint = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqEndpoint });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqUser });
    mockFrom.mockReturnValueOnce({ delete: deleteFn });

    const { DELETE } = await import("../push/subscribe/route");
    const res = await DELETE(request("DELETE", { endpoint: SUBSCRIPTION.endpoint }));

    expect(res.status).toBe(200);
    expect(deleteFn).toHaveBeenCalled();
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");
    expect(eqEndpoint).toHaveBeenCalledWith("endpoint", SUBSCRIPTION.endpoint);
  });
});
