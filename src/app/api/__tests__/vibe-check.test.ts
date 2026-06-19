// ============================================================
// Integration tests for:
//   POST /api/vibe-check  (src/app/api/vibe-check/route.ts)
//   GET  /api/venues      (src/app/api/venues/route.ts)
//
// STRATEGY:
// We test the full route handler functions directly (no HTTP server needed).
// External dependencies (OpenAI, Google Places, Supabase) are mocked at the
// module level so tests run offline without credentials.
//
// The routes are tested as black boxes: we feed them a NextRequest and assert
// on the NextResponse — status code, body shape, and headers.
//
// WHAT WE DO NOT TEST:
//   - That Zod's validation itself works (trust the framework).
//   - The AI response content (non-deterministic).
//   - Database write-back internals.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { MockedFunction } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/ai", () => ({
  analyzeVibe: vi.fn(),
  buildFallbackReport: vi.fn(),
}));

vi.mock("@/lib/places", () => ({
  getVenueDetails: vi.fn(),
  getVenueReviews: vi.fn(),
  searchVenues: vi.fn(),
  PlacesApiError: class PlacesApiError extends Error {
    constructor(message: string, public statusCode = 500) {
      super(message);
      this.name = "PlacesApiError";
    }
  },
}));

vi.mock("@/lib/supabase", () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
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

// Rate limiter: reset store before each test to prevent cross-test leakage
vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rateLimit")>();
  return { ...original };
});

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from "../vibe-check/route";
import { GET } from "../venues/route";
import { analyzeVibe } from "@/lib/ai";
import { getVenueDetails, getVenueReviews, searchVenues } from "@/lib/places";
import { resetRateLimitStore } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase";
import {
  makeVibeReport,
  makeVenueBasic,
  makeVenueDetail,
} from "../../../lib/__tests__/fixtures";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a NextRequest for the vibe-check POST route. */
function makeVibeCheckRequest(
  body: Record<string, unknown>,
  ip = "1.2.3.4"
): NextRequest {
  return new NextRequest("http://localhost/api/vibe-check", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
  });
}

/** Build a NextRequest for the venues GET route. */
function makeVenuesRequest(params: Record<string, string>, ip = "1.2.3.4"): NextRequest {
  const url = new URL("http://localhost/api/venues");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { "x-forwarded-for": ip },
  });
}

/** Wire up the standard "happy path" mocks. */
function setupHappyPathMocks(overrides: Partial<ReturnType<typeof makeVibeReport>> = {}) {
  const report = makeVibeReport(overrides);
  (getVenueDetails as MockedFunction<typeof getVenueDetails>).mockResolvedValue(
    makeVenueDetail()
  );
  (getVenueReviews as MockedFunction<typeof getVenueReviews>).mockResolvedValue([
    "Great place!",
  ]);
  (analyzeVibe as MockedFunction<typeof analyzeVibe>).mockResolvedValue(report);
  return report;
}

// ── POST /api/vibe-check ──────────────────────────────────────────────────────

describe("POST /api/vibe-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();

    // Reset Supabase chain so cachedVibeScore hydration doesn't interfere
    const emptyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    };
    (supabaseAdmin.from as MockedFunction<typeof supabaseAdmin.from>).mockReturnValue(
      emptyChain as any
    );
  });

  // Happy path: all dependencies succeed → 200 with a VibeReport in the envelope.
  it("returns 200 with a VibeReport when the request is valid", async () => {
    const report = setupHappyPathMocks();

    const req = makeVibeCheckRequest({
      venueId: "ChIJtest1234",
      venueName: "The Neon Lounge",
      location: "123 Main St",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.vibeScore).toBe(report.vibeScore);
    expect(json.data.vibeTags).toEqual(report.vibeTags);
    expect(json.data.summary).toBe(report.summary);
    expect(json.meta).toBeDefined();
  });

  // venueId is required — missing it must return a 4xx, not 500.
  it("returns 422 when venueId is missing", async () => {
    const req = makeVibeCheckRequest({ venueName: "Some Bar" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.status).toBe("error");
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when venueName is missing", async () => {
    const req = makeVibeCheckRequest({ venueId: "ChIJtest" });
    const res = await POST(req);

    expect(res.status).toBe(422);
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/vibe-check", {
      method: "POST",
      body: "this is not json {{",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // OpenAI failure must never bubble up as a 500 — analyzeVibe() returns a
  // fallback internally, so the route always gets a valid VibeReport.
  it("returns 200 with a fallback VibeReport when OpenAI throws", async () => {
    const fallback = makeVibeReport({ confidence: 0.05 });
    (getVenueDetails as MockedFunction<typeof getVenueDetails>).mockResolvedValue(
      makeVenueDetail()
    );
    (getVenueReviews as MockedFunction<typeof getVenueReviews>).mockResolvedValue([]);
    // analyzeVibe itself returns the fallback (never throws)
    (analyzeVibe as MockedFunction<typeof analyzeVibe>).mockResolvedValue(fallback);

    const req = makeVibeCheckRequest({
      venueId: "ChIJtest",
      venueName: "Error Bar",
      location: "Nowhere",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(json.data.confidence).toBe(0.05);
  });

  // When a photo is provided, analyzeVibe must be called with photoBase64 set.
  it("passes photoBase64 to analyzeVibe when it is present in the body", async () => {
    setupHappyPathMocks();

    const req = makeVibeCheckRequest({
      venueId: "ChIJtest",
      venueName: "Photo Bar",
      photoBase64: "base64encodedphotocontent",
    });
    await POST(req);

    const callArgs = (analyzeVibe as MockedFunction<typeof analyzeVibe>).mock.calls[0][0];
    expect(callArgs.photoBase64).toBe("base64encodedphotocontent");
  });

  // The Zod transform in the route strips the "data:image/..." prefix before
  // passing to analyzeVibe.
  it("strips the data: URI prefix from photoBase64 before calling analyzeVibe", async () => {
    setupHappyPathMocks();

    const req = makeVibeCheckRequest({
      venueId: "ChIJtest",
      venueName: "Photo Bar",
      photoBase64: "data:image/jpeg;base64,abc123rawdata",
    });
    await POST(req);

    const callArgs = (analyzeVibe as MockedFunction<typeof analyzeVibe>).mock.calls[0][0];
    expect(callArgs.photoBase64).toBe("abc123rawdata");
    expect(callArgs.photoBase64).not.toContain("data:image");
  });

  // Cache efficiency: calling twice with the same venueId should not break
  // the route (actual deduplication is in analyzeVibe, but we verify the route
  // calls analyzeVibe each time, leaving caching to the AI module).
  it("calls analyzeVibe for each request (cache is the AI module's responsibility)", async () => {
    setupHappyPathMocks();

    const makeReq = () =>
      makeVibeCheckRequest({
        venueId: "ChIJsame",
        venueName: "Same Bar",
      });

    await POST(makeReq());
    await POST(makeReq());

    expect(analyzeVibe).toHaveBeenCalledTimes(2);
  });

  // Rate limiting: after 10 requests the 11th must be rejected with 429.
  it("returns 429 after exceeding the rate limit", async () => {
    setupHappyPathMocks();

    const ip = "9.9.9.9"; // dedicated IP so it doesn't interfere with other tests

    // Fire 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const req = makeVibeCheckRequest(
        { venueId: "ChIJtest", venueName: "Rate Bar" },
        ip
      );
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    // 11th request must be rate-limited
    const req = makeVibeCheckRequest(
      { venueId: "ChIJtest", venueName: "Rate Bar" },
      ip
    );
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  // Places API failure is non-fatal: we fall through with empty venue context.
  it("returns 200 even when the Places API fails to fetch venue details", async () => {
    (getVenueDetails as MockedFunction<typeof getVenueDetails>).mockRejectedValue(
      new Error("Places API down")
    );
    (getVenueReviews as MockedFunction<typeof getVenueReviews>).mockRejectedValue(
      new Error("Places API down")
    );
    (analyzeVibe as MockedFunction<typeof analyzeVibe>).mockResolvedValue(
      makeVibeReport({ vibeScore: 5, confidence: 0.3 })
    );

    const req = makeVibeCheckRequest({
      venueId: "ChIJtest",
      venueName: "Mystery Bar",
      location: "Unknown",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(analyzeVibe).toHaveBeenCalledOnce();
  });
});

// ── GET /api/venues ───────────────────────────────────────────────────────────

describe("GET /api/venues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();

    const emptyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    };
    (supabaseAdmin.from as MockedFunction<typeof supabaseAdmin.from>).mockReturnValue(
      emptyChain as any
    );
  });

  // Happy path: valid query + lat/lng → 200 with venue array.
  it("returns 200 with a venues array for a valid request", async () => {
    const venues = [makeVenueBasic({ name: "Test Bar" }), makeVenueBasic({ name: "Club Two" })];
    (searchVenues as MockedFunction<typeof searchVenues>).mockResolvedValue(venues);

    const req = makeVenuesRequest({ q: "rooftop bar", lat: "40.7", lng: "-74.0" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("success");
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].name).toBe("Test Bar");
  });

  // Missing the required 'q' param must return a 4xx error.
  it("returns 422 when the 'q' query parameter is missing", async () => {
    const req = makeVenuesRequest({ lat: "40.7", lng: "-74.0" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.status).toBe("error");
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 for an empty 'q' string", async () => {
    const req = makeVenuesRequest({ q: "" });
    const res = await GET(req);

    expect(res.status).toBe(422);
  });

  // Invalid lat/lng values must be rejected before hitting Places.
  it("returns 422 when lat is not a valid number", async () => {
    const req = makeVenuesRequest({ q: "bar", lat: "notanumber", lng: "-74.0" });
    const res = await GET(req);

    expect(res.status).toBe(422);
  });

  // Places API failure → 200 with demo venues + PLACES_UNAVAILABLE code (not a 500 or empty).
  // Clients see demo venues rather than an empty or error screen.
  it("returns 200 with demo venues and PLACES_UNAVAILABLE code when Places API fails", async () => {
    (searchVenues as MockedFunction<typeof searchVenues>).mockRejectedValue(
      new Error("quota exceeded")
    );

    const req = makeVenuesRequest({ q: "bar" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("partial");
    // Demo fallback: 6 hardcoded venues returned instead of empty array
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.error.code).toBe("PLACES_UNAVAILABLE");
    expect(json.meta.demo_mode).toBe(true);
  });

  // No lat/lng is a valid request — Places uses text search only.
  it("returns 200 when lat/lng are omitted (text-only search)", async () => {
    (searchVenues as MockedFunction<typeof searchVenues>).mockResolvedValue([
      makeVenueBasic(),
    ]);

    const req = makeVenuesRequest({ q: "jazz bar" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(searchVenues).toHaveBeenCalledWith("jazz bar", undefined, undefined);
  });

  // The route hydrates cached vibe scores onto results. Verify searchVenues
  // is called with the correct args regardless of hydration outcome.
  it("calls searchVenues with correct lat/lng when provided", async () => {
    (searchVenues as MockedFunction<typeof searchVenues>).mockResolvedValue([]);

    const req = makeVenuesRequest({ q: "club", lat: "51.5", lng: "-0.12" });
    await GET(req);

    expect(searchVenues).toHaveBeenCalledWith("club", 51.5, -0.12);
  });

  // Rate limit for venues route is separate (keyed with "venues:" prefix).
  it("returns 429 after exceeding the venue search rate limit", async () => {
    (searchVenues as MockedFunction<typeof searchVenues>).mockResolvedValue([]);

    const ip = "8.8.8.8";

    // The venues rate limit is 30/min — exhaust it
    for (let i = 0; i < 30; i++) {
      await GET(makeVenuesRequest({ q: "bar" }, ip));
    }

    const res = await GET(makeVenuesRequest({ q: "bar" }, ip));
    expect(res.status).toBe(429);
  });
});
