// ============================================================
// Night Vibe Checker — Test fixtures and factory functions
//
// WHY THIS FILE EXISTS:
// Centralising fixture creation means every test file starts from the same
// valid baseline shapes. Tests only declare the fields they actually care
// about via the `overrides` parameter. This prevents "fixture drift" where
// different test files quietly define subtly incompatible objects.
//
// All factories are pure functions — no side effects, no I/O.
// ============================================================

import type { VibeReport, VenueBasic, VenueDetail, VibeInput } from "../../types";

// ── Factory functions ────────────────────────────────────────────────────────

/**
 * Build a complete, valid VibeReport.
 * Every field is a concrete value so snapshot assertions are deterministic
 * (no `expect.any()` necessary for basic shape checks).
 */
export function makeVibeReport(overrides: Partial<VibeReport> = {}): VibeReport {
  return {
    id: "fixture-report-id-0001",
    venueId: "ChIJtest1234detail",
    venueName: "The Neon Lounge",
    vibeScore: 7.5,
    vibeTags: ["Lively", "Trendy", "Great Cocktails"],
    energyLevel: "High",
    musicVibe: "Loud / Dance",
    crowdType: "Packed",
    bestFor: ["Date Night", "Group Night Out"],
    summary:
      "A lively rooftop spot with expertly crafted cocktails and a pulsing DJ set. Perfect for a stylish night out with friends or a date night to remember.",
    fromPhoto: false,
    confidence: 0.85,
    generatedAt: "2026-06-18T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Build a valid VenueBasic (search-result level — no reviews or photos).
 */
export function makeVenueBasic(overrides: Partial<VenueBasic> = {}): VenueBasic {
  return {
    placeId: "ChIJtest1234basic",
    name: "The Neon Lounge",
    address: "123 Main St, New York, NY 10001",
    lat: 40.7128,
    lng: -74.006,
    type: "bar",
    googleRating: 4.3,
    totalRatings: 512,
    priceLevel: 3,
    photoReference: "photo_ref_abc123",
    ...overrides,
  };
}

/**
 * Build a valid VenueDetail (full detail, including resolved photo URLs and
 * review text snippets — the shape the AI module receives).
 */
export function makeVenueDetail(overrides: Partial<VenueDetail> = {}): VenueDetail {
  return {
    placeId: "ChIJtest1234detail",
    name: "The Neon Lounge",
    address: "123 Main St, New York, NY 10001",
    lat: 40.7128,
    lng: -74.006,
    type: "bar",
    googleRating: 4.3,
    totalRatings: 512,
    priceLevel: 3,
    photoReference: "photo_ref_abc123",
    phoneNumber: "+1 212-555-0199",
    website: "https://theneonlounge.example.com",
    openingHours: [
      "Monday: 5:00 – 2:00 AM",
      "Friday: 5:00 – 4:00 AM",
      "Saturday: 5:00 – 4:00 AM",
    ],
    editorialSummary: "A chic rooftop bar with panoramic city views.",
    photos: [
      "https://maps.googleapis.com/maps/api/place/photo?photo_reference=ref1&maxwidth=800",
      "https://maps.googleapis.com/maps/api/place/photo?photo_reference=ref2&maxwidth=800",
    ],
    reviews: [
      "Amazing vibes! The rooftop is stunning and the cocktails are top notch.",
      "Great atmosphere but can get very crowded on weekends.",
    ],
    ...overrides,
  };
}

/**
 * Build a valid VibeInput — the shape passed to analyzeVibe().
 */
export function makeVibeInput(overrides: Partial<VibeInput> = {}): VibeInput {
  return {
    venueId: "ChIJtest1234detail",
    venueName: "The Neon Lounge",
    address: "123 Main St, New York, NY 10001",
    venueType: "bar",
    googleRating: 4.3,
    priceLevel: 3,
    reviews: [
      "Amazing vibes! The rooftop is stunning and the cocktails are top notch.",
      "Great atmosphere but can get very crowded on weekends.",
    ],
    photoBase64: undefined,
    ...overrides,
  };
}

// ── Raw AI response fixtures ─────────────────────────────────────────────────

/**
 * The exact JSON string a well-behaved OpenAI call returns.
 * Must remain valid JSON and satisfy the VibeReportAISchema Zod schema
 * that ai.ts uses internally.
 */
export const RAW_AI_RESPONSE_VALID = JSON.stringify({
  vibeScore: 8.0,
  energyLevel: "High",
  vibeTags: ["Lively", "Trendy", "Great Cocktails", "Photogenic"],
  musicVibe: "Loud / Dance",
  crowdType: "Packed",
  bestFor: ["Date Night", "Group Night Out", "Late Night"],
  summary:
    "An electric rooftop experience with expertly crafted cocktails and a live DJ spinning hip-hop and R&B. The crowd is stylish and energetic, making it ideal for a memorable night out.",
  confidence: 0.87,
});

/**
 * JSON response missing optional fields (vibeTags with too few items,
 * bestFor empty, summary short). Used to test Zod fallback behaviour.
 */
export const RAW_AI_RESPONSE_MISSING_FIELDS = JSON.stringify({
  vibeScore: 6.0,
  energyLevel: "Medium",
  vibeTags: ["Chill"],   // only 1 — Zod min(3) will fail → fallback
  musicVibe: "Soft / Ambient",
  crowdType: "Moderate",
  bestFor: [],           // empty — Zod min(1) will fail → fallback
  summary: "Ok.",        // too short — Zod min(40) will fail → fallback
  confidence: 0.5,
});

/**
 * A completely broken string — not JSON at all.
 * parseVibeResponse / analyzeVibe must return buildFallbackReport without
 * throwing.
 */
export const RAW_AI_RESPONSE_INVALID =
  "Sorry, I cannot analyze venues. Here is some lorem ipsum: dolor sit amet...";
