import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
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
    gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnValue(promise),
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

describe("GET /api/activity/feed", () => {
  it("returns anonymous recent check-in signals with venue data", async () => {
    const checkInsChain = chain({
      data: [
        {
          id: "check-in-1",
          venue_id: "venue-1",
          busyness: "packed",
          crowd_feel: "balanced",
          created_at: "2026-06-21T03:10:00.000Z",
          user_id: "must-not-leak",
        },
        {
          id: "check-in-2",
          venue_id: "venue-2",
          busyness: "dead",
          crowd_feel: "mixed",
          created_at: "2026-06-21T03:05:00.000Z",
        },
      ],
    });
    mockFrom
      .mockReturnValueOnce(checkInsChain)
      .mockReturnValueOnce(chain({
        data: [
          { id: "venue-1", name: "The Neon Room", hidden: false },
          { id: "venue-2", name: "Vault", hidden: true },
        ],
      }));

    const { GET } = await import("../activity/feed/route");
    const req = new Request("http://localhost/api/activity/feed") as NextRequest;
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).toEqual({
      items: [
        {
          id: "check-in-1",
          venue: { id: "venue-1", name: "The Neon Room" },
          busyness: "packed",
          crowd_feel: "balanced",
          checked_in_at: "2026-06-21T03:10:00.000Z",
        },
      ],
    });
    expect(JSON.stringify(json)).not.toContain("must-not-leak");
    expect(mockFrom).toHaveBeenNthCalledWith(1, "check_ins");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "venues");
    expect(mockFrom).not.toHaveBeenCalledWith("profiles");
    expect(checkInsChain.gte).toHaveBeenCalledWith("created_at", "2026-06-21T01:30:00.000Z");
    expect(checkInsChain.limit).toHaveBeenCalledWith(10);
  });

  it("returns an empty feed when no recent check-ins exist", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [] }))
      .mockReturnValueOnce(chain({ data: [] }));

    const { GET } = await import("../activity/feed/route");
    const req = new Request("http://localhost/api/activity/feed") as NextRequest;
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toEqual([]);
  });
});
