// ============================================================
// Unit tests for src/lib/ai.ts
//
// WHAT WE TEST:
//   - buildFallbackReport(): shape and field derivation logic
//   - getCachedReport(): Supabase query and null-on-miss behaviour
//   - analyzeVibe(): cache-hit branch (OpenAI must NOT be called)
//   - analyzeVibe(): cache-miss → OpenAI called, result parsed
//   - analyzeVibe(): OpenAI throws → fallback returned, no re-throw
//   - analyzeVibe(): photoBase64 passed → image_url in messages
//   - analyzeVibe(): photoBase64 present → cache skipped
//
// WHAT WE DO NOT TEST:
//   - Whether the Zod schema is wired correctly (that's framework behaviour).
//   - The exact wording of the AI summary (non-deterministic).
//   - Supabase `persistReport` write-back (fire-and-forget; failures are logged).
//
// MOCKING STRATEGY:
//   vi.mock() replaces the entire "@/lib/supabase" module so no Supabase
//   env vars are needed. The OpenAI client is injected via setOpenAIClient().
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockedFunction } from "vitest";

// ── Hoist mocks before any module under test is imported ────────────────────

vi.mock("@/lib/supabase", () => {
  const mockSingle = vi.fn();
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: mockSingle,
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  return {
    supabase: { from: vi.fn().mockReturnValue(chain) },
    supabaseAdmin: { from: vi.fn().mockReturnValue(chain) },
  };
});

// ── Now import the module under test ────────────────────────────────────────

import {
  analyzeVibe,
  buildFallbackReport,
  getCachedReport,
  setOpenAIClient,
  CACHE_TTL_MS,
} from "../ai";
import { supabaseAdmin } from "@/lib/supabase";
import {
  makeVibeInput,
  makeVibeReport,
  RAW_AI_RESPONSE_VALID,
  RAW_AI_RESPONSE_INVALID,
} from "./fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fresh Supabase chain mock and wire it to supabaseAdmin.from().
 * Returns the chain so individual tests can configure .single() freely.
 */
function makeSupabaseChain(singleResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(singleResult),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  (supabaseAdmin.from as MockedFunction<typeof supabaseAdmin.from>).mockReturnValue(
    chain as any
  );
  return chain;
}

/** Build a minimal mock OpenAI client with a configurable completion response. */
function makeMockOpenAI(content: string) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content } }],
  });
  return { chat: { completions: { create } }, _create: create };
}

// ── buildFallbackReport ───────────────────────────────────────────────────────

// The fallback report is critical: it's what users see when AI is unavailable.
// We verify it satisfies the VibeReport shape and includes the venue identity.
describe("buildFallbackReport()", () => {
  it("returns a VibeReport with the correct venueId and venueName", () => {
    const input = makeVibeInput({ venueId: "abc-123", venueName: "Club Zero" });
    const report = buildFallbackReport(input);

    expect(report.venueId).toBe("abc-123");
    expect(report.venueName).toBe("Club Zero");
  });

  it("sets confidence to a low value (< 0.2)", () => {
    const report = buildFallbackReport(makeVibeInput());
    expect(report.confidence).toBeLessThan(0.2);
  });

  it("sets fromPhoto to true when photoBase64 is present in input", () => {
    const input = makeVibeInput({ photoBase64: "abc123base64data" });
    const report = buildFallbackReport(input);
    expect(report.fromPhoto).toBe(true);
  });

  it("sets fromPhoto to false when no photo is provided", () => {
    const report = buildFallbackReport(makeVibeInput({ photoBase64: undefined }));
    expect(report.fromPhoto).toBe(false);
  });

  it("derives a non-zero vibeScore from googleRating when available", () => {
    const input = makeVibeInput({ googleRating: 4.0 });
    const report = buildFallbackReport(input);
    // 4.0/5 * 10 = 8.0
    expect(report.vibeScore).toBeGreaterThan(0);
    expect(report.vibeScore).toBeLessThanOrEqual(10);
  });

  it("defaults vibeScore to 5 when googleRating is absent", () => {
    const input = makeVibeInput({ googleRating: undefined });
    const report = buildFallbackReport(input);
    expect(report.vibeScore).toBe(5);
  });

  it("includes a non-empty summary mentioning the venue name or address", () => {
    const input = makeVibeInput({ venueName: "The Blue Parrot" });
    const report = buildFallbackReport(input);
    expect(report.summary.length).toBeGreaterThan(20);
    expect(report.summary).toContain("The Blue Parrot");
  });

  it("assigns a truthy id (UUID string)", () => {
    const report = buildFallbackReport(makeVibeInput());
    expect(typeof report.id).toBe("string");
    expect(report.id.length).toBeGreaterThan(0);
  });

  it("sets generatedAt to a recent ISO timestamp", () => {
    const before = Date.now();
    const report = buildFallbackReport(makeVibeInput());
    const after = Date.now();
    const reportTime = new Date(report.generatedAt).getTime();
    expect(reportTime).toBeGreaterThanOrEqual(before);
    expect(reportTime).toBeLessThanOrEqual(after);
  });
});

// ── getCachedReport ───────────────────────────────────────────────────────────

// getCachedReport wraps the Supabase query. We verify the null-on-miss contract
// and the happy-path data extraction.
describe("getCachedReport()", () => {
  it("returns null when Supabase returns an error", async () => {
    makeSupabaseChain({ data: null, error: { message: "row not found" } });
    const result = await getCachedReport("nonexistent-venue");
    expect(result).toBeNull();
  });

  it("returns null when Supabase returns null data with no error", async () => {
    makeSupabaseChain({ data: null, error: null });
    const result = await getCachedReport("venue-id");
    expect(result).toBeNull();
  });

  it("returns a VibeReport shaped object when a valid row exists", async () => {
    const dbRow = {
      id: "row-uuid",
      place_id: "ChIJtest",
      vibe_score: "7.5",
      energy_level: "High",
      vibe_tags: ["Lively", "Trendy"],
      music_vibe: "Loud / Dance",
      crowd_type: "Packed",
      best_for: ["Date Night"],
      summary: "A great spot.",
      confidence: "0.9",
      from_photo: false,
      generated_at: new Date().toISOString(),
    };
    makeSupabaseChain({ data: dbRow, error: null });

    const result = await getCachedReport("ChIJtest");
    expect(result).not.toBeNull();
    expect(result!.vibeScore).toBe(7.5);
    expect(result!.energyLevel).toBe("High");
  });

  it("queries with a cutoff date based on CACHE_TTL_MS", async () => {
    const chain = makeSupabaseChain({ data: null, error: null });
    await getCachedReport("ChIJtest");
    // Should have called .gte() with a cutoff timestamp argument
    expect(chain.gte).toHaveBeenCalledWith(
      "generated_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
  });
});

// ── analyzeVibe — cache hit ───────────────────────────────────────────────────

// THE MOST IMPORTANT BUSINESS RULE: if a fresh cache entry exists and no
// photo is provided, we must NOT bill the user another OpenAI token.
describe("analyzeVibe() — cache hit (no photo)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the cached report and does NOT call OpenAI", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mockOpenAI as any);

    const cachedReport = makeVibeReport({
      venueId: "ChIJtest",
      vibeScore: 9.0,
      confidence: 0.95,
      // generatedAt must be within TTL
      generatedAt: new Date(Date.now() - CACHE_TTL_MS / 2).toISOString(),
    });

    // Simulate a fresh cache hit from Supabase
    makeSupabaseChain({
      data: {
        id: cachedReport.id,
        place_id: cachedReport.venueId,
        vibe_score: String(cachedReport.vibeScore),
        energy_level: cachedReport.energyLevel,
        vibe_tags: cachedReport.vibeTags,
        music_vibe: cachedReport.musicVibe,
        crowd_type: cachedReport.crowdType,
        best_for: cachedReport.bestFor,
        summary: cachedReport.summary,
        confidence: String(cachedReport.confidence),
        from_photo: false,
        generated_at: cachedReport.generatedAt,
      },
      error: null,
    });

    const input = makeVibeInput({ venueId: "ChIJtest", photoBase64: undefined });
    const result = await analyzeVibe(input);

    expect(result.vibeScore).toBe(9.0);
    expect(mockOpenAI._create).not.toHaveBeenCalled();
  });
});

// ── analyzeVibe — cache miss ─────────────────────────────────────────────────

describe("analyzeVibe() — cache miss", () => {
  it("calls OpenAI when no cache entry exists and parses the result", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mockOpenAI as any);

    // Cache miss: Supabase returns null
    makeSupabaseChain({ data: null, error: { message: "No rows found" } });

    const input = makeVibeInput({ photoBase64: undefined });
    const result = await analyzeVibe(input);

    expect(mockOpenAI._create).toHaveBeenCalledOnce();
    // vibeScore from RAW_AI_RESPONSE_VALID is 8.0
    expect(result.vibeScore).toBe(8.0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns buildFallbackReport when OpenAI throws without re-throwing", async () => {
    const mockOpenAI = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error("OpenAI outage")) } },
      _create: vi.fn(),
    };
    setOpenAIClient(mockOpenAI as any);

    makeSupabaseChain({ data: null, error: { message: "No rows" } });

    const input = makeVibeInput({ venueName: "Error Bar" });
    // analyzeVibe must not throw
    const result = await expect(analyzeVibe(input)).resolves.toBeDefined();
    // The resolved value should be a fallback with low confidence
    const report = await analyzeVibe(input);
    expect(report.confidence).toBeLessThan(0.2);
    expect(report.venueName).toBe("Error Bar");
  });

  it("returns buildFallbackReport when OpenAI returns invalid JSON", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_INVALID);
    setOpenAIClient(mockOpenAI as any);

    makeSupabaseChain({ data: null, error: null });

    const input = makeVibeInput({ venueName: "Parse Error Lounge" });
    const result = await analyzeVibe(input);

    expect(result.confidence).toBeLessThan(0.2);
    expect(result.venueName).toBe("Parse Error Lounge");
  });
});

// ── analyzeVibe — photo upload flow ──────────────────────────────────────────

describe("analyzeVibe() — with photoBase64", () => {
  it("passes the image as an image_url message part to OpenAI", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mockOpenAI as any);

    // Even with a cache, a photo always triggers a fresh OpenAI call
    makeSupabaseChain({ data: null, error: null });

    const input = makeVibeInput({ photoBase64: "abc123base64imagedata" });
    await analyzeVibe(input);

    expect(mockOpenAI._create).toHaveBeenCalledOnce();
    const callArgs = mockOpenAI._create.mock.calls[0][0];
    const messages = callArgs.messages as any[];

    // Find the user message
    const userMsg = messages.find((m: any) => m.role === "user");
    expect(userMsg).toBeDefined();
    // Content must be an array (multimodal)
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imagePart = (userMsg.content as any[]).find((p: any) => p.type === "image_url");
    expect(imagePart).toBeDefined();
    expect(imagePart.image_url.url).toContain("abc123base64imagedata");
  });

  it("sets fromPhoto = true on the returned report", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mockOpenAI as any);
    makeSupabaseChain({ data: null, error: null });

    const result = await analyzeVibe(makeVibeInput({ photoBase64: "somephotodata" }));
    expect(result.fromPhoto).toBe(true);
  });

  it("skips the cache lookup when photoBase64 is provided", async () => {
    const mockOpenAI = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mockOpenAI as any);

    const chain = makeSupabaseChain({ data: null, error: null });
    const input = makeVibeInput({ photoBase64: "photodata" });
    await analyzeVibe(input);

    // .single() (which is the cache read) must NOT have been called
    expect(chain.single).not.toHaveBeenCalled();
    // But OpenAI was called
    expect(mockOpenAI._create).toHaveBeenCalledOnce();
  });
});
