import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVenueRatingAggregate } from "@/lib/venueRatingAggregate";

const redisGet = vi.hoisted(() => vi.fn());
const redisSet = vi.hoisted(() => vi.fn());
const mockSql = vi.hoisted(() => vi.fn());

vi.mock("@/lib/upstashRedis", () => ({
  redis: { get: redisGet, set: redisSet },
}));

vi.mock("@/lib/db", () => ({ sql: mockSql }));

describe("getVenueRatingAggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue("OK");
    mockSql.mockResolvedValue([]);
  });

  it("returns visible cached aggregates without querying Neon", async () => {
    redisGet.mockResolvedValue({ avg: 4.33, count: 3 });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toEqual({ avg: 4.33, count: 3 });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns null for cached aggregates below the visibility threshold", async () => {
    redisGet.mockResolvedValue({ avg: 5, count: 2 });

    await expect(getVenueRatingAggregate("venue-1")).resolves.toBeNull();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("computes, caches, and returns aggregate from Neon on cache miss", async () => {
    mockSql.mockResolvedValue([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);

    await expect(getVenueRatingAggregate("venue-1")).resolves.toEqual({ avg: 4.33, count: 3 });
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledWith("nv:rating:venue-1", { avg: 4.33, count: 3 }, { ex: 300 });
  });

  it("caches but hides aggregates below the visibility threshold", async () => {
    mockSql.mockResolvedValue([{ rating: 5 }, { rating: 4 }]);

    await expect(getVenueRatingAggregate("venue-1")).resolves.toBeNull();
    expect(redisSet).toHaveBeenCalledWith("nv:rating:venue-1", { avg: 4.5, count: 2 }, { ex: 300 });
  });
});
