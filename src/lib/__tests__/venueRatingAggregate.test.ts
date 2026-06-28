import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVenueRatingAggregate } from "@/lib/venueRatingAggregate";

const redisGet = vi.hoisted(() => vi.fn());
const redisSet = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn(() => ({ eq })));
const from = vi.hoisted(() => vi.fn(() => ({ select })));

vi.mock("@/lib/upstashRedis", () => ({
  redis: {
    get: redisGet,
    set: redisSet,
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from,
  },
}));

describe("getVenueRatingAggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    eq.mockResolvedValue({ data: [], error: null });
  });

  it("returns visible cached aggregates without querying Supabase", async () => {
    redisGet.mockResolvedValue({ avg: 4.33, count: 3 });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toEqual({ avg: 4.33, count: 3 });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null for cached aggregates below the visibility threshold", async () => {
    redisGet.mockResolvedValue({ avg: 5, count: 2 });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("computes, caches, and returns aggregate from Supabase on cache miss", async () => {
    eq.mockResolvedValue({
      data: [{ rating: 5 }, { rating: 4 }, { rating: 4 }],
      error: null,
    });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toEqual({ avg: 4.33, count: 3 });
    expect(from).toHaveBeenCalledWith("venue_ratings");
    expect(select).toHaveBeenCalledWith("rating");
    expect(eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(redisSet).toHaveBeenCalledWith("nv:rating:venue-1", { avg: 4.33, count: 3 }, { ex: 300 });
  });

  it("caches but hides Supabase aggregates below the visibility threshold", async () => {
    eq.mockResolvedValue({
      data: [{ rating: 5 }, { rating: 4 }],
      error: null,
    });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toBeNull();
    expect(redisSet).toHaveBeenCalledWith("nv:rating:venue-1", { avg: 4.5, count: 2 }, { ex: 300 });
  });
});
