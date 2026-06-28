import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  sql: mockSql,
}));

vi.mock("@/auth", () => ({
  auth: mockAuth,
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
  mockSql.mockResolvedValue([]);
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
});

describe("/api/push/venue-alert", () => {
  it("requires an authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "venue-123" }));

    expect(res.status).toBe(401);
  });

  it("validates venueId", async () => {
    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns current alert state", async () => {
    mockSql.mockResolvedValueOnce([{ id: "alert-123" }]);

    const { GET } = await import("../push/venue-alert/route");
    const res = await GET(getRequest("venue-123"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("upserts an alert by user and venue", async () => {
    const { POST } = await import("../push/venue-alert/route");
    const res = await POST(request("POST", { venueId: "venue-123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("deletes an alert by user and venue", async () => {
    const { DELETE } = await import("../push/venue-alert/route");
    const res = await DELETE(request("DELETE", { venueId: "venue-123" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alerting).toBe(false);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });
});
