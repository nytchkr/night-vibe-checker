import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockAdminGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAssertSupabaseServerEnv = vi.fn();

class MockMissingSupabaseEnvError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing ${variableName} - add to .env.local`);
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
  it("returns 401 when no Bearer token is provided", async () => {
    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    await expect(res.json()).resolves.toEqual({ error: "Authentication required." });
    expect(mockAdminGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty checkIns array when the user has no check-ins", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    await expect(res.json()).resolves.toEqual({ data: { checkIns: [] }, nextCursor: null });
  });

  it("returns check-ins with venueId, venueName, venueAddress, busyness, and createdAt fields", async () => {
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

  it("supports cursor pagination by querying only check-ins before the cursor date", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const cursor = "2026-06-27T10:00:00.000Z";
    const query = checkInsQuery({
      data: [
        {
          id: "check-in-before-cursor",
          venue_id: "venue-1",
          busyness: "moderate",
          created_at: "2026-06-27T09:59:59.000Z",
          venues: { name: "Canopy", address: "123 Camden Rd" },
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token", cursor));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    expect(query.lt).toHaveBeenCalledWith("created_at", cursor);
    await expect(res.json()).resolves.toEqual({
      data: {
        checkIns: [
          {
            id: "check-in-before-cursor",
            venueId: "venue-1",
            venueName: "Canopy",
            venueAddress: "123 Camden Rd",
            busyness: "moderate",
            createdAt: "2026-06-27T09:59:59.000Z",
          },
        ],
      },
      nextCursor: null,
    });
  });

  it("returns 50 check-ins max per page and uses the last createdAt as nextCursor", async () => {
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: `check-in-${index}`,
      venue_id: `venue-${index}`,
      busyness: "moderate",
      created_at: `2026-06-27T09:${String(59 - index).padStart(2, "0")}:00.000Z`,
      venues: [{ name: `Venue ${index}`, address: `${index} Camden Rd` }],
    }));
    const query = checkInsQuery({ data: rows, error: null });
    mockFrom.mockReturnValue(query);

    const { GET } = await import("../user/check-ins/route");
    const res = await GET(request("token"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache");
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(body.data.checkIns).toHaveLength(50);
    expect(body.nextCursor).toBe(rows[49].created_at);
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
