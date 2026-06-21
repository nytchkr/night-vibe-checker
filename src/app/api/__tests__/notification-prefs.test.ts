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

const validPrefs = {
  pushEnabled: true,
  savedVenueBusy: true,
  subscribedVenueAlerts: true,
  friendCheckIns: false,
  weeklyLeaderboard: false,
};

function patchRequest(body: unknown, token = "token") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/profile/notification-prefs", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function deleteRequest(token = "token") {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/venues/venue-123/alerts", {
    method: "DELETE",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
});

describe("PATCH /api/profile/notification-prefs", () => {
  it("requires an authenticated user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid" } });

    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest({ notificationPrefs: validPrefs }));

    expect(res.status).toBe(401);
  });

  it("validates the notification prefs payload", async () => {
    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest({ notificationPrefs: { pushEnabled: true } }));

    expect(res.status).toBe(422);
  });

  it("upserts notification prefs on the profile row", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce({ upsert });

    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest({ notificationPrefs: validPrefs }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.notificationPrefs).toEqual(validPrefs);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(upsert).toHaveBeenCalledWith(
      { id: "user-123", notification_prefs: validPrefs },
      { onConflict: "id" },
    );
  });
});

describe("DELETE /api/venues/[id]/alerts", () => {
  it("removes an alert by user and venue", async () => {
    const eqVenue = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqVenue });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqUser });
    mockFrom.mockReturnValueOnce({ delete: deleteFn });

    const { DELETE } = await import("../venues/[id]/alerts/route");
    const res = await DELETE(deleteRequest(), { params: Promise.resolve({ id: "venue-123" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ venueId: "venue-123", alerting: false });
    expect(mockFrom).toHaveBeenCalledWith("push_venue_alerts");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");
    expect(eqVenue).toHaveBeenCalledWith("venue_id", "venue-123");
  });
});
