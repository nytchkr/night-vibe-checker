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
  RAW_AI_RESPONSE_MISSING_FIELDS,
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

// ── Zod schema parsing (via analyzeVibe) ─────────────────────────────────────
//
// VibeReportAISchema is internal to ai.ts, so we test its behaviour by
// injecting controlled JSON strings through the mock OpenAI client and
// observing whether analyzeVibe returns a valid parsed report or falls back.

describe("Zod schema parsing", () => {
  beforeEach(() => {
    // Always start with a cache miss so the AI call is always reached
    makeSupabaseChain({ data: null, error: { message: "no rows" } });
  });

  it("valid AI response parses correctly and returns a VibeReport with expected fields", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    const result = await analyzeVibe(makeVibeInput({ photoBase64: undefined }));

    // RAW_AI_RESPONSE_VALID has vibeScore: 8.0
    expect(result.vibeScore).toBe(8.0);
    expect(result.energyLevel).toBe("High");
    expect(result.crowdType).toBe("Packed");
    expect(result.confidence).toBeCloseTo(0.87);
    // confidence should be well above the fallback threshold
    expect(result.confidence).toBeGreaterThan(0.2);
  });

  it("score value is preserved when within 0–10 range (no clamping needed)", async () => {
    const response = JSON.stringify({
      vibeScore: 7.3,
      energyLevel: "Medium",
      vibeTags: ["Chill", "Trendy", "Great Cocktails"],
      musicVibe: "Moderate",
      crowdType: "Moderate",
      bestFor: ["Casual Hangout"],
      summary:
        "A relaxed neighbourhood spot with great cocktails and a friendly crowd. Ideal for an easy midweek unwind with colleagues.",
      confidence: 0.75,
    });

    const mock = makeMockOpenAI(response);
    setOpenAIClient(mock as any);

    const result = await analyzeVibe(makeVibeInput());
    // Zod rounds to one decimal: Math.round(7.3 * 10) / 10 === 7.3
    expect(result.vibeScore).toBe(7.3);
  });

  it("response with vibeTags below min(3) falls back to a low-confidence report", async () => {
    // RAW_AI_RESPONSE_MISSING_FIELDS has vibeTags: ["Chill"] (only 1 — Zod min(3) fails)
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_MISSING_FIELDS);
    setOpenAIClient(mock as any);

    const result = await analyzeVibe(makeVibeInput());

    // Should return the fallback (low confidence) rather than the parsed data
    expect(result.confidence).toBeLessThan(0.2);
  });

  it("completely non-JSON response falls back without throwing", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_INVALID);
    setOpenAIClient(mock as any);

    const result = await analyzeVibe(makeVibeInput({ venueName: "Bad JSON Bar" }));

    expect(result.confidence).toBeLessThan(0.2);
    expect(result.venueName).toBe("Bad JSON Bar");
  });

  it("extra unknown fields in AI response are stripped (Zod strips by default)", async () => {
    // Zod's .parse() strips unknown fields; result must not include "unknownField"
    const responseWithExtras = JSON.stringify({
      vibeScore: 6.5,
      energyLevel: "Medium",
      vibeTags: ["Chill", "Locals Hangout", "Craft Beer"],
      musicVibe: "Soft / Ambient",
      crowdType: "Sparse",
      bestFor: ["Solo Exploring", "Casual Hangout"],
      summary:
        "A quiet neighbourhood pub with craft beers and a loyal local following. Great for a solo drink and a book.",
      confidence: 0.6,
      unknownField: "should be stripped",
      anotherExtra: 999,
    });

    const mock = makeMockOpenAI(responseWithExtras);
    setOpenAIClient(mock as any);

    const result = await analyzeVibe(makeVibeInput());

    // The parsed result must not carry through the unexpected field
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    expect((result as Record<string, unknown>).anotherExtra).toBeUndefined();
    // And the report should be valid (not a fallback)
    expect(result.confidence).toBeGreaterThan(0.2);
  });
});

// ── Prompt builder (via analyzeVibe) ─────────────────────────────────────────
//
// buildUserPrompt() is not exported directly, so we verify its output by
// inspecting the `messages` array passed to openai.chat.completions.create().

describe("Prompt builder", () => {
  beforeEach(() => {
    makeSupabaseChain({ data: null, error: { message: "no rows" } });
  });

  it("includes the venue name in the user prompt", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    await analyzeVibe(makeVibeInput({ venueName: "The Crystal Cavern" }));

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();

    const promptText =
      typeof userMsg!.content === "string"
        ? userMsg!.content
        : (userMsg!.content as Array<{ type: string; text?: string }>).find(
            (p) => p.type === "text"
          )?.text ?? "";

    expect(promptText).toContain("The Crystal Cavern");
  });

  it("includes the venue address in the user prompt", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    await analyzeVibe(
      makeVibeInput({ address: "999 Test Ave, Brooklyn, NY 11201" })
    );

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    const promptText =
      typeof userMsg!.content === "string"
        ? userMsg!.content
        : (userMsg!.content as Array<{ type: string; text?: string }>).find(
            (p) => p.type === "text"
          )?.text ?? "";

    expect(promptText).toContain("999 Test Ave, Brooklyn, NY 11201");
  });

  it("includes reviews text in the user prompt when reviews are present", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    await analyzeVibe(
      makeVibeInput({ reviews: ["Absolutely incredible atmosphere!"] })
    );

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    const promptText =
      typeof userMsg!.content === "string"
        ? userMsg!.content
        : (userMsg!.content as Array<{ type: string; text?: string }>).find(
            (p) => p.type === "text"
          )?.text ?? "";

    expect(promptText).toContain("Absolutely incredible atmosphere!");
  });

  it("includes a 'No reviews available' notice when reviews array is empty", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    await analyzeVibe(makeVibeInput({ reviews: [] }));

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    const promptText =
      typeof userMsg!.content === "string"
        ? userMsg!.content
        : (userMsg!.content as Array<{ type: string; text?: string }>).find(
            (p) => p.type === "text"
          )?.text ?? "";

    expect(promptText).toContain("No reviews available");
  });

  it("prompt content is a plain string (not multimodal array) when no photo provided", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    await analyzeVibe(makeVibeInput({ photoBase64: undefined }));

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    // Without a photo the content must be a plain string
    expect(typeof userMsg!.content).toBe("string");
  });

  it("prompt content is an array (multimodal) when photoBase64 is provided", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);
    // photoBase64 triggers a different code path in ai.ts that skips cache
    makeSupabaseChain({ data: null, error: null });

    await analyzeVibe(makeVibeInput({ photoBase64: "fakephotodata" }));

    const callArgs = mock._create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string | unknown[] }>;
    };
    const userMsg = callArgs.messages.find((m) => m.role === "user");
    expect(Array.isArray(userMsg!.content)).toBe(true);
  });
});

// ── Cache logic ───────────────────────────────────────────────────────────────
//
// These tests focus on the 2-hour TTL contract and the side-effects:
// cache hit → OpenAI not called; cache miss → OpenAI called; expired → fresh call.

describe("Cache logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cache hit returns stored report without calling OpenAI", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    // Simulate a fresh cache entry (well within TTL)
    const cachedData = {
      id: "cached-id-001",
      place_id: "ChIJcacheHit",
      vibe_score: "9.0",
      energy_level: "Intense",
      vibe_tags: ["Lively", "Trendy", "Cover Charge"],
      music_vibe: "Loud / Dance",
      crowd_type: "Waiting-List Packed",
      best_for: ["Late Night"],
      summary: "A legendary rooftop club. Pure energy all night.",
      confidence: "0.95",
      from_photo: false,
      generated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago — fresh
    };

    makeSupabaseChain({ data: cachedData, error: null });

    const result = await analyzeVibe(
      makeVibeInput({ venueId: "ChIJcacheHit", photoBase64: undefined })
    );

    // OpenAI must not have been called
    expect(mock._create).not.toHaveBeenCalled();
    // The returned score comes from the cache row
    expect(result.vibeScore).toBe(9.0);
  });

  it("cache miss calls OpenAI and result reflects fresh AI response", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    // No cached row
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(
      makeVibeInput({ venueId: "ChIJcacheMiss", photoBase64: undefined })
    );

    expect(mock._create).toHaveBeenCalledOnce();
    // vibeScore from RAW_AI_RESPONSE_VALID is 8.0
    expect(result.vibeScore).toBe(8.0);
  });

  it("expired cache entry (>2 hr old) triggers a fresh OpenAI call", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);

    // The expired row was generated 3 hours ago — outside CACHE_TTL_MS
    // getCachedReport uses .gte("generated_at", cutoff) so Supabase would
    // return no rows for an expired entry. We simulate that here.
    makeSupabaseChain({ data: null, error: { message: "no rows found within TTL" } });

    // Advance fake clock by 3 hours to confirm the TTL cutoff logic
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);

    const result = await analyzeVibe(
      makeVibeInput({ venueId: "ChIJexpired", photoBase64: undefined })
    );

    // OpenAI called because the cache returned nothing (simulating TTL expiry)
    expect(mock._create).toHaveBeenCalledOnce();
    expect(result.vibeScore).toBe(8.0);
  });

  it("CACHE_TTL_MS is exactly 2 hours (7200000 ms)", () => {
    expect(CACHE_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });
});

// ── analyzeVibe happy path ────────────────────────────────────────────────────

describe("analyzeVibe() — happy path", () => {
  it("returns a VibeReport with the correct venueId from input", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(
      makeVibeInput({ venueId: "ChIJhappyPath-001" })
    );

    expect(result.venueId).toBe("ChIJhappyPath-001");
  });

  it("returns the parsed report from the mock client (not a fallback)", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(makeVibeInput());

    // RAW_AI_RESPONSE_VALID has confidence: 0.87 — well above the fallback value
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.vibeScore).toBe(8.0);
  });

  it("sets generatedAt to a recent ISO timestamp on fresh reports", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_VALID);
    setOpenAIClient(mock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const before = Date.now();
    const result = await analyzeVibe(makeVibeInput());
    const after = Date.now();

    const ts = new Date(result.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ── analyzeVibe error handling ───────────────────────────────────────────────

describe("analyzeVibe() — error handling", () => {
  it("returns a fallback report when OpenAI throws — never re-throws", async () => {
    const failingMock = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("Network timeout")),
        },
      },
      _create: vi.fn(),
    };
    setOpenAIClient(failingMock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    // Must resolve, not reject
    await expect(
      analyzeVibe(makeVibeInput({ venueName: "Crash Club" }))
    ).resolves.toBeDefined();
  });

  it("fallback report has a vibeScore of 5 when no googleRating is available", async () => {
    const failingMock = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("Service unavailable")),
        },
      },
      _create: vi.fn(),
    };
    setOpenAIClient(failingMock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(
      makeVibeInput({ googleRating: undefined })
    );

    expect(result.vibeScore).toBe(5);
  });

  it("fallback report has confidence below 0.2", async () => {
    const failingMock = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("OpenAI down")),
        },
      },
      _create: vi.fn(),
    };
    setOpenAIClient(failingMock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(makeVibeInput({ venueName: "Safe Fallback Bar" }));

    expect(result.confidence).toBeLessThan(0.2);
  });

  it("fallback report preserves the venueName from input", async () => {
    const failingMock = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("Random failure")),
        },
      },
      _create: vi.fn(),
    };
    setOpenAIClient(failingMock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    const result = await analyzeVibe(makeVibeInput({ venueName: "Resilient Rooftop" }));

    expect(result.venueName).toBe("Resilient Rooftop");
  });

  it("Zod parse failure on invalid field values also triggers fallback without throwing", async () => {
    const mock = makeMockOpenAI(RAW_AI_RESPONSE_MISSING_FIELDS);
    setOpenAIClient(mock as any);
    makeSupabaseChain({ data: null, error: { message: "no rows" } });

    // Must not throw even though Zod will reject the schema
    await expect(analyzeVibe(makeVibeInput())).resolves.toBeDefined();

    const result = await analyzeVibe(makeVibeInput());
    expect(result.confidence).toBeLessThan(0.2);
  });
});
