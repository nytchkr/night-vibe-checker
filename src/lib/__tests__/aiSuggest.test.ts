import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SUGGEST_FILTER,
  explainRankedVenue,
  filterAndRankVenues,
  getFilterFromIntent,
  suggestVenues,
  type AISuggestRankedVenue,
} from "@/lib/aiSuggest";
import type { ConsumerVenue } from "@/types";

function venue(overrides: Partial<ConsumerVenue> = {}): ConsumerVenue {
  const id = overrides.id ?? "venue-1";
  return {
    id,
    slug: id,
    placeId: `place-${id}`,
    zoneId: "south-end-charlotte",
    name: "Test Venue",
    address: "100 South End",
    lat: 35.2123,
    lng: -80.859,
    category: "bar",
    rating: 4.5,
    googleRating: 4.5,
    totalRatings: 100,
    userRatingCount: 100,
    priceLevel: 2,
    hidden: false,
    signal: null,
    ...overrides,
  };
}

function ranked(item: ConsumerVenue): AISuggestRankedVenue {
  return {
    venue: item,
    distanceKm: 0.8,
    score: 50,
    scoreReasons: ["distance", "rating"],
  };
}

describe("aiSuggest real-data guardrails", () => {
  it("omits busyness and crowd language when the venue has no signal data", async () => {
    const result = await explainRankedVenue(ranked(venue()), async () => "This bar is close and rated 4.5.");

    expect(result.blocklistEvent).toBeNull();
    expect(result.pick.explanation).toBe("This bar is close and rated 4.5.");
    expect(result.pick.explanation).not.toMatch(/\b(busyness|crowd|packed|male|female|m\/f)\b/i);
    expect(result.pick.facts.busynessBucket).toBeNull();
    expect(result.pick.facts.mfRatio).toBeNull();
  });

  it("uses stored busyness and M/F facts only when confidence permits", async () => {
    const result = await explainRankedVenue(
      ranked(
        venue({
          signal: {
            venueId: "venue-1",
            placeId: "place-venue-1",
            busyness0To100: 74,
            busynessSource: "live",
            mfRatio: 0.62,
            confidence0To1: 0.8,
            sampleSize: 12,
            computedAt: "2026-06-26T20:00:00.000Z",
            updatedAt: null,
            lastBusynessRefresh: "2026-06-26T20:00:00.000Z",
          },
        }),
      ),
      async (facts) =>
        `${facts.name} is ${facts.busynessBucket} right now from ${facts.busynessSource}, with ${Math.round(
          (facts.mfRatio ?? 0) * 100,
        )}% M / ${100 - Math.round((facts.mfRatio ?? 0) * 100)}% F from recent check-ins.`,
    );

    expect(result.blocklistEvent).toBeNull();
    expect(result.pick.facts.busynessBucket).toBe("packed");
    expect(result.pick.facts.busynessSource).toBe("live");
    expect(result.pick.facts.mfRatio).toBe(0.62);
    expect(result.pick.explanation).toContain("packed right now from live");
    expect(result.pick.explanation).toContain("62% M / 38% F");
  });

  it("degrades vague vibes-only intent to default real filters", async () => {
    const result = await getFilterFromIntent("somewhere with good vibes only, nothing else matters");

    expect(result.filter).toEqual(DEFAULT_AI_SUGGEST_FILTER);
    expect(result.fallbackReason).toBe("vague_vibe_intent");
  });

  it("extracts time preference and group size from deterministic intent fallback", async () => {
    const result = await getFilterFromIntent("late night spot for a group of friends");

    expect(result.filter.timePreference).toBe("late");
    expect(result.filter.groupSize).toBe("group");
  });

  it("returns a blocklist fallback event with adjective and venue details", async () => {
    const result = await explainRankedVenue(ranked(venue({ id: "venue-blocked", name: "Blocked Bar" })), async () =>
      "Blocked Bar has a cozy romantic vibe tonight.",
    );

    expect(result.pick.explanationSource).toBe("validated-fallback");
    expect(result.blocklistEvent).toMatchObject({
      venueId: "venue-blocked",
      venueName: "Blocked Bar",
      term: "cozy",
      reason: "unsupported_vibe_adjective",
    });
    expect(result.pick.explanation).toMatch(/^Picked for:/);
  });

  it("excludes already shown venues so spin again does not repeat", async () => {
    const venues = [
      venue({ id: "venue-a", name: "Alpha", rating: 4.9 }),
      venue({ id: "venue-b", name: "Beta", rating: 4.2 }),
    ];

    const first = await suggestVenues({ mode: "surprise", intent: "", excludeVenueIds: [] }, venues);
    const second = await suggestVenues(
      { mode: "surprise", intent: "", excludeVenueIds: [first.picks[0].venue.id] },
      venues,
    );

    expect(first.picks).toHaveLength(1);
    expect(second.picks).toHaveLength(1);
    expect(second.picks[0].venue.id).not.toBe(first.picks[0].venue.id);
  });

  it("weights surprise picks toward unseen categories after repeated spins", () => {
    const venues = [
      venue({ id: "venue-a", name: "Alpha", category: "bar", rating: 4.9, googleRating: 4.9 }),
      venue({ id: "venue-b", name: "Beta", category: "bar", rating: 4.8, googleRating: 4.8 }),
      venue({ id: "venue-c", name: "Charlie", category: "bar", rating: 4.7, googleRating: 4.7 }),
      venue({ id: "venue-d", name: "Delta", category: "lounge", rating: 4.2, googleRating: 4.2 }),
    ];

    const ranked = filterAndRankVenues(venues, DEFAULT_AI_SUGGEST_FILTER, {
      excludeVenueIds: ["venue-a", "venue-b", "venue-c"],
      diversifyFromVenueIds: ["venue-a", "venue-b", "venue-c"],
    });

    expect(ranked[0].venue.id).toBe("venue-d");
    expect(ranked[0].scoreReasons).toContain("new category");
  });

  it("returns three ranked picks for help me decide", () => {
    const result = filterAndRankVenues(
      [
        venue({ id: "venue-a", name: "Alpha", rating: 4.9 }),
        venue({ id: "venue-b", name: "Beta", rating: 4.7 }),
        venue({ id: "venue-c", name: "Charlie", rating: 4.5 }),
      ],
      DEFAULT_AI_SUGGEST_FILTER,
    );

    expect(result.slice(0, 3).map((item) => item.venue.id)).toEqual(["venue-a", "venue-b", "venue-c"]);
  });

  it("can apply bounded score jitter for surprise mode without changing deterministic ranking by default", () => {
    const venues = [
      venue({ id: "venue-a", name: "Alpha", rating: 4.5, googleRating: 4.5 }),
      venue({ id: "venue-b", name: "Beta", rating: 4.4, googleRating: 4.4 }),
    ];

    const deterministic = filterAndRankVenues(venues, DEFAULT_AI_SUGGEST_FILTER);
    let randomIndex = 0;
    const randomValues = [0, 1];
    const jittered = filterAndRankVenues(venues, DEFAULT_AI_SUGGEST_FILTER, {
      scoreJitterPercent: 0.05,
      random: () => randomValues[randomIndex++] ?? 0.5,
    });

    expect(deterministic.map((item) => item.venue.id)).toEqual(["venue-a", "venue-b"]);
    expect(jittered.map((item) => item.venue.id)).toEqual(["venue-b", "venue-a"]);
    expect(jittered[0].scoreReasons).toContain("surprise variety");
  });
});
