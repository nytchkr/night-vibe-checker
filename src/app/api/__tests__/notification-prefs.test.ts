import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ sql: mockSql }));
vi.mock("@/lib/supabase", () => ({
  assertSupabaseServerEnv: vi.fn(),
  MissingSupabaseEnvError: class extends Error { constructor(v: string) { super(v); } },
}));

const validPrefs = { notifyBusyVenues: true, notifyWeeklySummary: false };

function patchRequest(body: unknown, withSession = true) {
  return new NextRequest("http://localhost/api/profile/notification-prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getRequest() {
  return new NextRequest("http://localhost/api/profile/notification-prefs", { method: "GET" });
}
function deleteAlertRequest(venueId = "venue-1") {
  return new NextRequest(`http://localhost/api/venues/${venueId}/alerts`, { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  mockSql.mockResolvedValue([]);
});

describe("PATCH /api/profile/notification-prefs", () => {
  it("requires an authenticated user", async () => {
    mockAuth.mockResolvedValue(null);
    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest(validPrefs, false));
    expect(res.status).toBe(401);
  });

  it("validates the notification prefs payload", async () => {
    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest({ notifyBusyVenues: "yes" }));
    expect(res.status).toBe(400);
  });

  it("upserts notification prefs for authenticated user", async () => {
    const { PATCH } = await import("../profile/notification-prefs/route");
    const res = await PATCH(patchRequest(validPrefs));
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalled();
  });
});

describe("GET /api/profile/notification-prefs", () => {
  it("returns stored notification prefs", async () => {
    mockSql.mockResolvedValue([{ notify_busy_venues: true, notify_weekly_summary: false }]);
    const { GET } = await import("../profile/notification-prefs/route");
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ notifyBusyVenues: true });
  });

  it("defaults busy alerts off when no preference row exists", async () => {
    mockSql.mockResolvedValue([]);
    const { GET } = await import("../profile/notification-prefs/route");
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ notifyBusyVenues: false, notifyWeeklySummary: false });
  });
});
