import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./upstashRedis";

type SlidingWindowDuration = Parameters<typeof Ratelimit.slidingWindow>[1];
type RatelimitRedis = ConstructorParameters<typeof Ratelimit>[0]["redis"];

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs?: number;
};

// Sliding window: 10 req/min per IP (public API default)
export const apiRateLimit = new Ratelimit({
  redis: redis as unknown as RatelimitRedis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "nv:rl:api",
});

// Strict: 3 check-ins per hour per user
export const checkInRateLimit = new Ratelimit({
  redis: redis as unknown as RatelimitRedis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
  prefix: "nv:rl:checkin",
});

const keyedLimiters = new Map<string, Ratelimit>();

function durationFromWindowMs(windowMs: number): SlidingWindowDuration {
  if (windowMs % (60 * 60_000) === 0) return `${windowMs / (60 * 60_000)} h` as SlidingWindowDuration;
  if (windowMs % 60_000 === 0) return `${windowMs / 60_000} m` as SlidingWindowDuration;
  return `${Math.max(1, Math.ceil(windowMs / 1_000))} s` as SlidingWindowDuration;
}

function getKeyedLimiter(max: number, windowMs: number): Ratelimit {
  const key = `${max}:${windowMs}`;
  const existing = keyedLimiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: redis as unknown as RatelimitRedis,
    limiter: Ratelimit.slidingWindow(max, durationFromWindowMs(windowMs)),
    prefix: `nv:rl:keyed:${max}:${windowMs}`,
  });
  keyedLimiters.set(key, limiter);
  return limiter;
}

export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const rate = await getKeyedLimiter(max, windowMs).limit(key);
  return {
    allowed: rate.success,
    limit: rate.limit,
    remaining: rate.remaining,
    retryAfterMs: rate.success ? undefined : Math.max(0, rate.reset - Date.now()),
  };
}

export function rateLimitHeaders(rate: Pick<RateLimitResult, "limit" | "remaining">): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
  };
}

export function retryAfterSeconds(rate: Pick<RateLimitResult, "retryAfterMs">, fallbackWindowMs: number): number {
  return Math.max(1, Math.ceil((rate.retryAfterMs ?? fallbackWindowMs) / 1000));
}
