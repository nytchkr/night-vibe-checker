import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
}));

function chain(resolved: { data?: unknown; error?: unknown }) {
  const promise = Promise.resolve({
    data: resolved.data ?? null,
    error: resolved.error ?? null,
  });
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
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

describe("GET /api/leaderboard", () => {
  it("returns top users ranked by weekly check-in count with public cache headers", async () => {
    mockFrom
      .mockReturnValueOnce(chain({
        data: [
          { user_id: "user-b", venue_id: "venue-2", venues: { name: "Vinyl" } },
          { user_id: "user-a", venue_id: "venue-1", venues: { name: "Canopy" } },
          { user_id: "user-a", venue_id: "venue-1", venues: { name: "Canopy" } },
          { user_id: "user-a", venue_id: "venue-2", venues: { name: "Vinyl" } },
        ],
      }))
      .mockReturnValueOnce(chain({
        data: [
          { id: "user-a", display_name: "Avery", avatar_url: "https://example.com/a.jpg" },
          { id: "user-b", display_name: "Blake", avatar_url: null },
        ],
      }));

    const { GET } = await import("../leaderboard/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(json).toEqual([
      {
        rank: 1,
        userId: "user-a",
        displayName: "Avery",
        avatarUrl: "https://example.com/a.jpg",
        checkInCount: 3,
        topVenue: "Canopy",
      },
      {
        rank: 2,
        userId: "user-b",
        displayName: "Blake",
        avatarUrl: null,
        checkInCount: 1,
        topVenue: "Vinyl",
      },
    ]);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "profiles");
  });

  it("returns DB_ERROR when check-ins cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "check_ins unavailable" } }));

    const { GET } = await import("../leaderboard/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });
});
