import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ sql: mockSql }));

function request(withSession = false) {
  return new NextRequest("http://localhost/api/account/delete", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAuth.mockResolvedValue(null);
  mockSql.mockResolvedValue([]);
});

describe("POST /api/account/delete", () => {
  it("returns 401 without an authenticated user", async () => {
    const { POST } = await import("../account/delete/route");
    const res = await POST(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("deletes user-owned account data when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });

    const { POST } = await import("../account/delete/route");
    const res = await POST(request(true));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockSql).toHaveBeenCalledTimes(2); // saved_venues, profiles
  });
});
