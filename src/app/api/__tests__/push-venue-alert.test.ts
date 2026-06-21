import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();
const mockGetSession = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} — add to .env.local`);
    this.name = "MissingSupabaseEnvError";
  }
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
  })),
}));

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getSession: mockGetSession },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: mockAssertSupabaseServerEnv,
  MissingSupabaseEnvError: MockMissingSupabaseEnvError,
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

function request(method: string, body?: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/push/venue-alert", {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
}

function getRequest(venueId: string, token = "token") {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/push/venue-alert?venueId=${encodeURIComponent(venueId)}`, {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
});

describe("/api/push/venue-alert", () => {
  it("requires an authenticated user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid" } });

    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "venue-123" }));

    expect(res.status).toBe(401);
  });

  it("validates venueId", async () => {
    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns current alert state", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "alert-123" }, error: null });
    const eqVenue = vi.fn().mockReturnValue({ maybeSingle });
    const eqUser = vi.fn().mockReturnValue({ eq: eqVenue });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    mockFrom.mockReturnValueOnce({ select });

    const { GET } = await import("../push/venue-alert/route");
    const res = await GET(getRequest("venue-123"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("push_venue_alerts");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");
    expect(eqVenue).toHaveBeenCalledWith("venue_id", "venue-123");
  });

  it("upserts an alert by user and venue", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "venue-123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("push_venue_alerts");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-123", venue_id: "venue-123" },
      { onConflict: "user_id,venue_id" },
    );
  });

  it("deletes an alert by user and venue", async () => {
    const eqVenue = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqVenue });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqUser });
    mockFrom.mockReturnValueOnce({ delete: deleteFn });

    const { DELETE } = await import("../push/venue-alert/route");
    const res = await DELETE(request("DELETE", { venueId: "venue-123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(false);
    expect(deleteFn).toHaveBeenCalled();
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");
    expect(eqVenue).toHaveBeenCalledWith("venue_id", "venue-123");
  });
});
