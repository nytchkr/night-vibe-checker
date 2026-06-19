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

// ── Environment variable stubs ────────────────────────────────────────────────
// Server modules throw at import/module-eval time if required env vars are
// missing. Stub them here so tests can import those modules without real
// credentials.

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GOOGLE_PLACES_API_KEY = "places-test-key";
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
  try {
    const { resetRateLimitStore } = await import("../lib/rateLimit");
    resetRateLimitStore();
  } catch {
    // Module may not be loaded in all test contexts — that's fine
  }
});
