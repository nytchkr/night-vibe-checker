import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAdminGetUser = vi.fn();
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
    auth: { getUser: mockAdminGetUser },
    from: mockFrom,
  },
}));

function request(token?: string, cursor?: string) {
  const url = new URL("http://localhost/api/user/check-ins");
  if (cursor) url.searchParams.set("cursor", cursor);

  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockAssertSupabaseServerEnv.mockReturnValue(undefined);
  mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
  mockFrom.mockReturnValue(checkInsQuery({ data: [], error: null }));
});

describe("GET /api/user/check-ins", () => {
  it("returns 401 without a valid bearer token", async () => {
    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    await expect(res.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's check-ins with venue fields", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const query = checkInsQuery({
      data: [
        {
          id: "check-in-1",
          venue_id: "venue-1",
          busyness: "packed",
          created_at: "2026-06-27T10:00:00.000Z",
          venues: { name: "Trio", address: "820 Hamilton St" },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    expect(mockAdminGetUser).toHaveBeenCalledWith("token");
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    expect(query.select).toHaveBeenCalledWith("id,venue_id,busyness,created_at,venues(name,address)");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-123");
    expect(query.eq).toHaveBeenNthCalledWith(2, "hidden", false);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(50);
    await expect(res.json()).resolves.toEqual({
      data: {
        checkIns: [
          {
            id: "check-in-1",
            venueId: "venue-1",
            venueName: "Trio",
            venueAddress: "820 Hamilton St",
            busyness: "packed",
            createdAt: "2026-06-27T10:00:00.000Z",
          },
        ],
      },
      nextCursor: null,
    });
  });

  it("applies cursor pagination and returns the last createdAt as nextCursor at page size", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: `check-in-${index}`,
      venue_id: `venue-${index}`,
      busyness: "moderate",
      created_at: `2026-06-${String(27 - Math.floor(index / 10)).padStart(2, "0")}T10:${String(index).padStart(2, "0")}:00.000Z`,
      venues: [{ name: `Venue ${index}`, address: `${index} Camden Rd` }],
    }));
    const query = checkInsQuery({ data: rows, error: null });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token", "2026-06-27T10:00:00.000Z"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(query.lt).toHaveBeenCalledWith("created_at", "2026-06-27T10:00:00.000Z");
    expect(body.data.checkIns).toHaveLength(50);
    expect(body.nextCursor).toBe(rows[49].created_at);
  });

  it("returns 200 with an empty checkIns array when the user has none", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { checkIns: [] }, nextCursor: null });
  });

  it("returns 500 when the check-in query fails", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mockFrom.mockReturnValue(checkInsQuery({ data: null, error: { message: "query failed" } }));

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    await expect(res.json()).resolves.toEqual({ error: "Could not fetch check-in history." });
  });
});

function checkInsQuery(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    then: promise.then.bind(promise),
  };

  return query;
}
