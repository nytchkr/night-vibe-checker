import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ sql: mockSql }));

function request(body?: unknown) {
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockSql.mockResolvedValue([]);
});

describe("POST /api/waitlist", () => {
  it("validates email server-side", async () => {
    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid email.");
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns 409 when email is already on the waitlist", async () => {
    mockSql.mockResolvedValueOnce([{ email: "fan@example.com" }]);

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "Fan@Example.com" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Already on the list!");
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("inserts a normalized email", async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: " Fan@Example.com " }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("maps unique constraint races to 409", async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("duplicate key"));

    const { POST } = await import("../waitlist/route");
    const res = await POST(request({ email: "fan@example.com" }));

    expect(res.status).toBe(409);
  });
});
