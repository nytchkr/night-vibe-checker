import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  getRemainingRequests,
  rateLimitHeaders,
  resetRateLimitStore,
  retryAfterSeconds,
} from "../rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    resetRateLimitStore();
  });

  afterEach(() => {
    resetRateLimitStore();
    vi.useRealTimers();
  });

  it("allows requests until the key reaches its window limit", () => {
    expect(checkRateLimit("email:user@example.com", 3, 10 * 60_000)).toEqual({
      allowed: true,
      limit: 3,
      remaining: 2,
    });
    expect(checkRateLimit("email:user@example.com", 3, 10 * 60_000).remaining).toBe(1);
    expect(checkRateLimit("email:user@example.com", 3, 10 * 60_000).remaining).toBe(0);

    const blocked = checkRateLimit("email:user@example.com", 3, 10 * 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(3);
    expect(blocked.remaining).toBe(0);
    expect(retryAfterSeconds(blocked, 10 * 60_000)).toBe(600);
  });

  it("returns retry timing when a key hits the limit mid-window", () => {
    expect(checkRateLimit("ip:203.0.113.25", 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit("ip:203.0.113.25", 2, 60_000).allowed).toBe(true);

    vi.advanceTimersByTime(15_250);

    const blocked = checkRateLimit("ip:203.0.113.25", 2, 60_000);
    expect(blocked).toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterMs: 44_750,
    });
    expect(retryAfterSeconds(blocked, 60_000)).toBe(45);
  });

  it("tracks independent keys and resets after the window expires", () => {
    expect(checkRateLimit("user:a", 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit("user:a", 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("user:b", 1, 60_000).allowed).toBe(true);

    vi.advanceTimersByTime(60_000);

    expect(checkRateLimit("user:a", 1, 60_000)).toEqual({
      allowed: true,
      limit: 1,
      remaining: 0,
    });
  });

  it("resets the quota exactly when the window boundary is reached", () => {
    expect(checkRateLimit("route:/api/venues", 1, 1_000).allowed).toBe(true);

    vi.advanceTimersByTime(999);
    expect(checkRateLimit("route:/api/venues", 1, 1_000).allowed).toBe(false);

    vi.advanceTimersByTime(1);
    expect(checkRateLimit("route:/api/venues", 1, 1_000)).toEqual({
      allowed: true,
      limit: 1,
      remaining: 0,
    });
  });

  it("applies the same key limit across concurrent request attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => Promise.resolve(checkRateLimit("session:concurrent", 3, 60_000)))
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(2);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0, 0]);
  });

  it("reports remaining quota and serializes rate-limit headers", () => {
    const rate = checkRateLimit("push:203.0.113.1", 5, 60 * 60_000);
    expect(getRemainingRequests("push:203.0.113.1", 5, 60 * 60_000)).toBe(4);
    expect(rateLimitHeaders(rate)).toEqual({
      "X-RateLimit-Limit": "5",
      "X-RateLimit-Remaining": "4",
    });
  });
});
