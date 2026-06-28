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

function request(method = "GET", body?: unknown, token?: string) {
  return new NextRequest("http://localhost/api/saved-venues", {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
});

describe("/api/saved-venues", () => {
  it("returns 401 without an authenticated user", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const { GET } = await import("../saved-venues/route");

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns saved venue text IDs ordered by created_at", async () => {
    mockSql.mockResolvedValueOnce([{ venue_id: "google-place-text-id" }, { venue_id: "uuid-or-slug-id" }]);

    const { GET } = await import("../saved-venues/route");
    const res = await GET(request("GET", undefined, "token"));

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      status: "success",
      place_ids: ["google-place-text-id", "uuid-or-slug-id"],
      venueIds: ["google-place-text-id", "uuid-or-slug-id"],
      data: { savedVenueIds: ["google-place-text-id", "uuid-or-slug-id"] },
    });
  });

  it("saves a non-UUID place_id for the authenticated user", async () => {
    const { POST } = await import("../saved-venues/route");
    const res = await POST(request("POST", { place_id: "place_text_123" }, "token"));

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      status: "success",
      ok: true,
      venueId: "place_text_123",
      saved: true,
    });
  });

  it("still accepts legacy venueId bodies", async () => {
    const { POST } = await import("../saved-venues/route");
    const res = await POST(request("POST", { venueId: "legacy-id" }, "token"));

    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });
});
