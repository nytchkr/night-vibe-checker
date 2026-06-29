// ============================================================
// nytchkr — In-memory rate limiter
// Legacy in-memory limiter — used only in tests. Production uses Upstash (upstashRateLimit.ts)
//
// Keyed by arbitrary string (typically client IP).
// Each key gets up to `max` requests per `windowMs` rolling window.
//
// Limitations: in-memory only — does not persist across
// serverless function invocations. For production multi-region
// deployments replace with Upstash Redis (@upstash/ratelimit).
// ============================================================

interface RateLimitEntry {
  count: number;
  windowStart: number; // epoch ms
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs?: number;
}

// Module-level Map survives across requests in a long-running Node process.
// In edge / serverless this resets per cold start — acceptable for MVP.
const store = new Map<string, RateLimitEntry>();

export const RATE_LIMIT_MAX = 10;          // requests allowed per window
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1-minute sliding window

/**
 * Check and increment the rate limit counter for `key`.
 *
 * Returns `{ allowed: true }` when under the limit.
 * Returns `{ allowed: false, retryAfterMs }` when exceeded.
 */
export function checkRateLimit(
  key: string,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // New key or expired window — start a fresh window
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, limit: max, remaining: Math.max(0, max - 1) };
  }

  if (entry.count >= max) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, limit: max, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, limit: max, remaining: Math.max(0, max - entry.count) };
}

export function rateLimitHeaders(rate: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
  };
}

export function retryAfterSeconds(
  rate: Pick<RateLimitResult, "retryAfterMs">,
  fallbackWindowMs: number
): number {
  return Math.max(1, Math.ceil((rate.retryAfterMs ?? fallbackWindowMs) / 1000));
}

/**
 * Return how many requests remain in the current window for `key`.
 * Returns `max` for unknown keys (no requests made yet).
 */
export function getRemainingRequests(
  key: string,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) return max;
  return Math.max(0, max - entry.count);
}

/** Purge expired entries — call periodically to prevent unbounded memory growth. */
export function pruneExpiredEntries(
  windowMs: number = RATE_LIMIT_WINDOW_MS
): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart >= windowMs) store.delete(key);
  }
}

/** Reset entire store — intended for use in test suites only. */
export function resetRateLimitStore(): void {
  store.clear();
}
