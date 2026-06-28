// ============================================================
// Vitest global test setup
//
// Runs before every test file. Keeps individual test files clean by
// handling concerns that apply universally:
//   - Stubbing env vars so modules that assert their presence don't throw
//   - Silencing console output that pollutes test output
//   - Resetting rate-limit store between test files
// ============================================================

import { vi, beforeAll, afterAll, afterEach } from "vitest";

const upstashRateLimitStore = vi.hoisted(() => new Map<string, { count: number; reset: number }>());

vi.mock("@upstash/ratelimit", () => {
  function parseDurationMs(duration: string): number {
    const [amountRaw, unit] = duration.split(/\s+/);
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) return 60_000;
    if (unit?.startsWith("h")) return amount * 60 * 60_000;
    if (unit?.startsWith("m")) return amount * 60_000;
    if (unit?.startsWith("s")) return amount * 1_000;
    return 60_000;
  }

  class MockRatelimit {
    private readonly maxRequests: number;
    private readonly windowMs: number;
    private readonly prefix: string;

    constructor(config: { limiter: { maxRequests: number; windowMs: number }; prefix?: string }) {
      this.maxRequests = config.limiter.maxRequests;
      this.windowMs = config.limiter.windowMs;
      this.prefix = config.prefix ?? "ratelimit";
    }

    static slidingWindow(maxRequests: number, duration: string) {
      return { maxRequests, windowMs: parseDurationMs(duration) };
    }

    async limit(identifier: string) {
      const now = Date.now();
      const key = `${this.prefix}:${identifier}`;
      const entry = upstashRateLimitStore.get(key);

      if (!entry || entry.reset <= now) {
        const reset = now + this.windowMs;
        upstashRateLimitStore.set(key, { count: 1, reset });
        return { success: true, limit: this.maxRequests, remaining: Math.max(0, this.maxRequests - 1), reset };
      }

      if (entry.count >= this.maxRequests) {
        return { success: false, limit: this.maxRequests, remaining: 0, reset: entry.reset };
      }

      entry.count += 1;
      return { success: true, limit: this.maxRequests, remaining: Math.max(0, this.maxRequests - entry.count), reset: entry.reset };
    }
  }

  return { Ratelimit: MockRatelimit };
});

// ── Environment variable stubs ────────────────────────────────────────────────
// Server modules throw at import/module-eval time if required env vars are
// missing. Stub them here so tests can import those modules without real
// credentials.

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GOOGLE_PLACES_API_KEY = "places-test-key";
process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-upstash-token";
// NODE_ENV is read-only in TypeScript strict mode — already "test" when vitest runs

// ── Console silencing ────────────────────────────────────────────────────────
// Suppress expected warning/error output that would otherwise clutter the
// test run. Keep console.error visible for genuine test failures.

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Keep console.error active so unexpected errors are visible
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── Rate-limit store reset ────────────────────────────────────────────────────
// The rate-limit store is module-level state. Reset it after every test to
// prevent state bleeding between test cases in the same file.

afterEach(async () => {
  upstashRateLimitStore.clear();

  try {
    const { resetRateLimitStore } = await import("../lib/rateLimit");
    resetRateLimitStore();
  } catch {
    // Module may not be loaded in all test contexts — that's fine
  }
});
