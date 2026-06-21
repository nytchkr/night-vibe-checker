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
    order: vi.fn().mockReturnThis(),
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
});

describe("GET /api/activity/feed", () => {
  it("returns recent public check-ins with profile and venue metadata", async () => {
    mockFrom
      .mockReturnValueOnce(chain({
        data: [
          {
            id: "check-in-1",
            user_id: "user-a",
            venue_id: "venue-1",
            created_at: "2026-06-21T03:10:00.000Z",
            venues: { id: "venue-1", name: "Canopy" },
          },
          {
            id: "check-in-2",
            user_id: "user-b",
            venue_id: "venue-2",
            created_at: "2026-06-21T02:50:00.000Z",
            venues: { id: "venue-2", name: "Vinyl" },
          },
        ],
      }))
      .mockReturnValueOnce(chain({
        data: [
          { id: "user-a", display_name: "Avery", avatar_url: "https://example.com/a.jpg" },
          { id: "user-b", display_name: "Blake", avatar_url: null },
        ],
      }));

    const { GET } = await import("../activity/feed/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(json).toEqual({
      items: [
        {
          id: "check-in-1",
          user: { name: "Avery", avatar_url: "https://example.com/a.jpg" },
          venue: { id: "venue-1", name: "Canopy" },
          checked_in_at: "2026-06-21T03:10:00.000Z",
        },
        {
          id: "check-in-2",
          user: { name: "Blake", avatar_url: null },
          venue: { id: "venue-2", name: "Vinyl" },
          checked_in_at: "2026-06-21T02:50:00.000Z",
        },
      ],
    });
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "profiles");
  });

  it("returns DB_ERROR when check-ins cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { message: "check_ins unavailable" } }));

    const { GET } = await import("../activity/feed/route");
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("DB_ERROR");
  });
});
