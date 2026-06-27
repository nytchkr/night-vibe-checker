import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-21T03:30:00.000Z"));
});

describe("GET /api/venues/[id]/activity", () => {
  it("returns recent venue check-ins with public profile metadata and cache headers", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: "venue-123" } }))
      .mockReturnValueOnce(chain({
        data: [
          { user_id: "user-a", created_at: "2026-06-21T03:10:00.000Z" },
          { user_id: "user-b", created_at: "2026-06-21T02:30:00.000Z" },
        ],
      }));
    mockGetUserById
      .mockResolvedValueOnce({
        data: {
          user: {
            email: "a@example.com",
            user_metadata: { display_name: "Avery", avatar_url: "https://example.com/a.jpg" },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            email: "b@example.com",
            user_metadata: { full_name: "Blake" },
          },
        },
        error: null,
      });

    const { GET } = await import("../venues/[id]/activity/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-123/activity"), {
      params: Promise.resolve({ id: "venue-123" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json.status).toBe("success");
    expect(json.data.activity).toEqual([
      {
        displayName: "Avery",
        avatarUrl: "https://example.com/a.jpg",
        checkedInAt: "2026-06-21T03:10:00.000Z",
        minutesAgo: 20,
      },
      {
        displayName: "Blake",
        avatarUrl: null,
        checkedInAt: "2026-06-21T02:30:00.000Z",
        minutesAgo: 60,
      },
    ]);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "venues");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "check_ins");
  });

  it("returns an empty activity list when no recent check-ins exist", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: "venue-123" } }))
      .mockReturnValueOnce(chain({ data: [] }));

    const { GET } = await import("../venues/[id]/activity/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/venue-123/activity"), {
      params: Promise.resolve({ id: "venue-123" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.activity).toEqual([]);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it("returns VENUE_NOT_FOUND when the venue cannot be resolved", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "not found" } }));

    const { GET } = await import("../venues/[id]/activity/route");
    const res = await GET(new NextRequest("http://localhost/api/venues/missing/activity"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("VENUE_NOT_FOUND");
  });
});
