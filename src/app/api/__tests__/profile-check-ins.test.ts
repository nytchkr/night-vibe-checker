import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockCookieGetUser = vi.fn();
const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockCookieGetUser },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    auth: { getUser: mockAdminGetUser },
    from: mockFrom,
  },
}));

function request(token?: string) {
  return new NextRequest("http://localhost/api/profile/check-ins", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockCookieGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no cookie" } });
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null }));
});

describe("GET /api/profile/check-ins", () => {
  it("returns an empty list without an authenticated user", async () => {
    const { GET } = await import("../profile/check-ins/route");
    const res = await GET(request());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the current user's last 10 visible check-ins with venue names", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const query = checkInsQuery({
      data: [
        {
          id: "check-in-1",
          venue_id: "venue-1",
          busyness: "packed",
          created_at: "2026-06-21T03:00:00.000Z",
          venues: { name: "Trio" },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../profile/check-ins/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    expect(query.select).toHaveBeenCalledWith("id,venue_id,busyness,created_at,venues(name)");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-123");
    expect(query.eq).toHaveBeenNthCalledWith(2, "hidden", false);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(10);
    await expect(res.json()).resolves.toEqual([
      {
        id: "check-in-1",
        venue_id: "venue-1",
        venue_name: "Trio",
        busyness: "packed",
        created_at: "2026-06-21T03:00:00.000Z",
      },
    ]);
  });
});

function checkInsQuery(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(promise),
  };

  return query;
}
