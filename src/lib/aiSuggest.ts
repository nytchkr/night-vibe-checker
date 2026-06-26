import { distanceMiles } from "@/lib/distance";
import type { ConsumerVenue } from "@/types";

export type AISuggestMode = "surprise" | "decide";
export type AISuggestBusynessPreference = "dead" | "moderate" | "any";

export type AISuggestFilter = {
  maxDistanceKm: number | null;
  priceLevelMax: 1 | 2 | 3 | 4 | null;
  categories: string[];
  busynessPreference: AISuggestBusynessPreference;
  requiresLiveData: boolean;
};

export type AISuggestRequest = {
  mode: AISuggestMode;
  intent?: string;
  userLat?: number | null;
  userLng?: number | null;
  excludeVenueIds?: string[];
};

export type AISuggestRankedVenue = {
  venue: ConsumerVenue;
  distanceKm: number | null;
  score: number;
  scoreReasons: string[];
};

export type AISuggestExplanationFacts = {
  name: string;
  category: string | null;
  distanceKm: number | null;
  priceLevel: number | null;
  rating: number | null;
  busynessBucket: "dead" | "moderate" | "packed" | null;
  busynessSource: string | null;
  mfRatio: number | null;
  mfSampleSize: number;
  mfConfidence: number;
};

export type AISuggestPick = {
  venue: ConsumerVenue;
  distanceKm: number | null;
  score: number;
  scoreReasons: string[];
  explanation: string;
  explanationSource: "llm" | "template" | "validated-fallback";
  facts: AISuggestExplanationFacts;
};

export type AISuggestBlocklistEvent = {
  venueId: string;
  venueName: string;
  term: string;
  reason: string;
  originalText: string;
};

export type AISuggestResult = {
  mode: AISuggestMode;
  filter: AISuggestFilter;
  filterFallbackReason: string | null;
  picks: AISuggestPick[];
  blocklistEvents: AISuggestBlocklistEvent[];
};

export type AISuggestFilterLLM = (intent: string) => Promise<unknown>;
export type AISuggestExplainLLM = (facts: AISuggestExplanationFacts) => Promise<string | null>;

export const DEFAULT_AI_SUGGEST_FILTER: AISuggestFilter = {
  maxDistanceKm: null,
  priceLevelMax: null,
  categories: [],
  busynessPreference: "any",
  requiresLiveData: false,
};

const MAX_DISTANCE_KM_LIMIT = 25;
const MIN_MF_SAMPLE_SIZE = 5;
const MIN_MF_CONFIDENCE = 0.6;
const VIBE_ADJECTIVE_BLOCKLIST = [
  "cozy",
  "romantic",
  "chill crowd",
  "friendly crowd",
  "great energy",
  "laid-back",
  "intimate",
  "lively",
  "date spot",
  "good vibes",
  "vibe",
] as const;

const BUSYNESS_LANGUAGE = /\b(dead|quiet|moderate|busy|packed|busyness|crowded|crowd|line|wait)\b/i;
const MF_LANGUAGE = /\b(m\/f|male|female|men|women|gender|ratio)\b/i;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function isPriceLevel(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isBusynessPreference(value: unknown): value is AISuggestBusynessPreference {
  return value === "dead" || value === "moderate" || value === "any";
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseAISuggestFilterPayload(payload: unknown): AISuggestFilter | null {
  let raw = payload;
  if (typeof payload === "string") {
    try {
      raw = JSON.parse(stripJsonFence(payload));
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const maxDistanceValue = record.max_distance_km ?? record.maxDistanceKm;
  const maxDistanceKm =
    typeof maxDistanceValue === "number" && Number.isFinite(maxDistanceValue)
      ? clampNumber(maxDistanceValue, 0.1, MAX_DISTANCE_KM_LIMIT)
      : null;

  const priceLevelValue = record.price_level_max ?? record.priceLevelMax;
  const priceLevelMax = isPriceLevel(priceLevelValue) ? priceLevelValue : null;

  const categoryValue = record.category ?? record.categories;
  const categories = Array.isArray(categoryValue)
    ? categoryValue
        .map(normalizeString)
        .filter((item): item is string => Boolean(item))
        .map(normalizeCategory)
        .slice(0, 5)
    : [];

  const busynessValue = record.busyness_preference ?? record.busynessPreference;
  const busynessPreference = isBusynessPreference(busynessValue) ? busynessValue : "any";

  return {
    maxDistanceKm,
    priceLevelMax,
    categories,
    busynessPreference,
    requiresLiveData: Boolean(record.requires_live_data ?? record.requiresLiveData),
  };
}

export function inferIntentFilter(intent: string): AISuggestFilter {
  const normalized = intent.toLowerCase();
  const next: AISuggestFilter = { ...DEFAULT_AI_SUGGEST_FILTER };

  if (/\b(cheap|budget|inexpensive|won'?t break the bank)\b/.test(normalized)) {
    next.priceLevelMax = 2;
  }

  if (/\b(close|near|nearby|walk|walking)\b/.test(normalized)) {
    next.maxDistanceKm = 2;
  }

  if (/\b(not packed|calm|quiet|dead|low key|low-key)\b/.test(normalized)) {
    next.busynessPreference = "dead";
  } else if (/\b(moderate|not too dead|some people|balanced)\b/.test(normalized)) {
    next.busynessPreference = "moderate";
  }

  const categories = ["bar", "club", "lounge", "restaurant", "brewery"].filter((category) =>
    normalized.includes(category),
  );
  next.categories = categories;

  if (/\b(live|right now|currently|tonight)\b/.test(normalized)) {
    next.requiresLiveData = true;
  }

  return next;
}

export async function getFilterFromIntent(
  intent: string | null | undefined,
  llm?: AISuggestFilterLLM,
): Promise<{ filter: AISuggestFilter; fallbackReason: string | null }> {
  const trimmedIntent = intent?.trim() ?? "";
  if (!trimmedIntent) return { filter: DEFAULT_AI_SUGGEST_FILTER, fallbackReason: "empty_intent" };

  if (llm) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const parsed = parseAISuggestFilterPayload(await llm(trimmedIntent));
        if (parsed) return { filter: parsed, fallbackReason: null };
      } catch {
        // Retry once, then use deterministic fallback below.
      }
    }
  }

  const inferred = inferIntentFilter(trimmedIntent);
  const isVagueVibeOnly =
    /\b(vibe|vibes|energy|scene|mood)\b/.test(trimmedIntent.toLowerCase()) &&
    !inferred.categories.length &&
    !inferred.priceLevelMax &&
    !inferred.maxDistanceKm &&
    inferred.busynessPreference === "any" &&
    !inferred.requiresLiveData;

  return {
    filter: isVagueVibeOnly ? DEFAULT_AI_SUGGEST_FILTER : inferred,
    fallbackReason: isVagueVibeOnly ? "vague_vibe_intent" : "llm_filter_unavailable",
  };
}

function getVenueDistanceKm(venue: ConsumerVenue, userLat?: number | null, userLng?: number | null): number | null {
  if (typeof userLat !== "number" || typeof userLng !== "number") return null;
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return null;
  return distanceMiles(userLat, userLng, venue.lat, venue.lng) * 1.609344;
}

function getRating(venue: ConsumerVenue): number | null {
  const rating = venue.rating ?? venue.googleRating ?? null;
  return typeof rating === "number" && Number.isFinite(rating) ? rating : null;
}

export function getBusynessBucket(value: number | null | undefined): AISuggestExplanationFacts["busynessBucket"] {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 70) return "packed";
  if (value >= 35) return "moderate";
  return "dead";
}

function matchesCategory(venue: ConsumerVenue, categories: string[]): boolean {
  if (!categories.length) return true;
  const category = normalizeCategory(venue.category ?? "");
  return categories.some((item) => category.includes(item));
}

function matchesBusynessPreference(venue: ConsumerVenue, preference: AISuggestBusynessPreference): boolean {
  if (preference === "any") return true;
  return getBusynessBucket(venue.signal?.busyness0To100) === preference;
}

export function filterAndRankVenues(
  venues: ConsumerVenue[],
  filter: AISuggestFilter,
  options: {
    userLat?: number | null;
    userLng?: number | null;
    excludeVenueIds?: string[];
    scoreJitterPercent?: number;
    random?: () => number;
  } = {},
): AISuggestRankedVenue[] {
  const excluded = new Set(options.excludeVenueIds ?? []);
  const jitterPercent = clampNumber(options.scoreJitterPercent ?? 0, 0, 0.05);
  const random = options.random ?? Math.random;

  return venues
    .filter((venue) => !venue.hidden)
    .filter((venue) => !excluded.has(venue.id) && !excluded.has(venue.placeId))
    .map((venue) => ({ venue, distanceKm: getVenueDistanceKm(venue, options.userLat, options.userLng) }))
    .filter(({ venue, distanceKm }) => {
      if (filter.maxDistanceKm != null && (distanceKm == null || distanceKm > filter.maxDistanceKm)) return false;
      if (filter.priceLevelMax != null && venue.priceLevel != null && venue.priceLevel > filter.priceLevelMax) return false;
      if (filter.requiresLiveData && venue.signal?.busyness0To100 == null) return false;
      if (!matchesCategory(venue, filter.categories)) return false;
      return matchesBusynessPreference(venue, filter.busynessPreference);
    })
    .map(({ venue, distanceKm }) => {
      const rating = getRating(venue);
      const busyness = venue.signal?.busyness0To100;
      const bucket = getBusynessBucket(busyness);
      let score = 0;
      const scoreReasons: string[] = [];

      if (distanceKm != null) {
        score += Math.max(0, 30 - distanceKm * 3);
        scoreReasons.push("distance");
      }
      if (rating != null) {
        score += rating * 8;
        scoreReasons.push("rating");
      }
      if (venue.priceLevel != null) {
        score += Math.max(0, 12 - venue.priceLevel * 2);
        scoreReasons.push("price");
      }
      if (busyness != null) {
        score += 8;
        scoreReasons.push("real busyness");
      }

      if (filter.busynessPreference === "dead" && bucket === "dead") score += 25;
      if (filter.busynessPreference === "moderate" && bucket === "moderate") score += 25;
      if (filter.busynessPreference === "any" && bucket === "moderate") score += 10;
      if (jitterPercent > 0 && score > 0) {
        const jitterMultiplier = 1 + (random() * 2 - 1) * jitterPercent;
        score *= jitterMultiplier;
        scoreReasons.push("surprise variety");
      }

      return { venue, distanceKm, score: Math.round(score * 10) / 10, scoreReasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ratingDelta = (getRating(b.venue) ?? 0) - (getRating(a.venue) ?? 0);
      if (ratingDelta !== 0) return ratingDelta;
      return a.venue.name.localeCompare(b.venue.name);
    });
}

export function buildExplanationFacts(ranked: AISuggestRankedVenue): AISuggestExplanationFacts {
  const signal = ranked.venue.signal;
  const mfRatio = signal?.mfRatio ?? null;
  const mfAllowed =
    mfRatio != null &&
    Number.isFinite(mfRatio) &&
    (signal?.sampleSize ?? 0) >= MIN_MF_SAMPLE_SIZE &&
    (signal?.confidence0To1 ?? 0) >= MIN_MF_CONFIDENCE;

  return {
    name: ranked.venue.name,
    category: ranked.venue.category || null,
    distanceKm: ranked.distanceKm == null ? null : Math.round(ranked.distanceKm * 10) / 10,
    priceLevel: ranked.venue.priceLevel ?? null,
    rating: getRating(ranked.venue),
    busynessBucket: getBusynessBucket(signal?.busyness0To100),
    busynessSource: signal?.busynessSource ?? null,
    mfRatio: mfAllowed ? mfRatio : null,
    mfSampleSize: signal?.sampleSize ?? 0,
    mfConfidence: signal?.confidence0To1 ?? 0,
  };
}

export function buildTemplateExplanation(facts: AISuggestExplanationFacts): string {
  const reasons: string[] = [];
  if (facts.distanceKm != null) reasons.push(`${facts.distanceKm.toFixed(1)} km away`);
  if (facts.priceLevel != null) reasons.push(`price level ${facts.priceLevel}`);
  if (facts.rating != null) reasons.push(`rated ${facts.rating.toFixed(1)}`);
  if (facts.busynessBucket && facts.busynessSource) {
    reasons.push(`${facts.busynessBucket} right now from ${facts.busynessSource}`);
  }
  if (facts.mfRatio != null) {
    const male = Math.round(facts.mfRatio * 100);
    reasons.push(`${male}% M / ${100 - male}% F from recent check-ins`);
  }

  const fallback = facts.category ? `${facts.category} with real venue data` : "real venue data";
  return `Picked for: ${reasons.length ? reasons.join(", ") : fallback}.`;
}

export function validateExplanation(
  text: string,
  facts: AISuggestExplanationFacts,
  venue: Pick<ConsumerVenue, "id" | "name">,
): { text: string; event: AISuggestBlocklistEvent | null } {
  const normalized = text.toLowerCase();
  const blocked = VIBE_ADJECTIVE_BLOCKLIST.find((term) => normalized.includes(term));
  const missingBusyness = !facts.busynessBucket && BUSYNESS_LANGUAGE.test(text);
  const missingMf = facts.mfRatio == null && MF_LANGUAGE.test(text);

  let term: string | null = null;
  let reason: string | null = null;
  if (blocked) {
    term = blocked;
    reason = "unsupported_vibe_adjective";
  } else if (missingBusyness) {
    term = text.match(BUSYNESS_LANGUAGE)?.[0] ?? "busyness";
    reason = "missing_busyness_fact";
  } else if (missingMf) {
    term = text.match(MF_LANGUAGE)?.[0] ?? "crowd";
    reason = "missing_mf_fact";
  }

  if (!term || !reason) return { text, event: null };

  return {
    text: buildTemplateExplanation(facts),
    event: {
      venueId: venue.id,
      venueName: venue.name,
      term,
      reason,
      originalText: text,
    },
  };
}

export async function explainRankedVenue(
  ranked: AISuggestRankedVenue,
  explain?: AISuggestExplainLLM,
): Promise<{ pick: AISuggestPick; blocklistEvent: AISuggestBlocklistEvent | null }> {
  const facts = buildExplanationFacts(ranked);
  const fallback = buildTemplateExplanation(facts);
  const generated = explain ? await explain(facts).catch(() => null) : null;
  if (!generated) {
    return {
      pick: {
        ...ranked,
        explanation: fallback,
        explanationSource: "template",
        facts,
      },
      blocklistEvent: null,
    };
  }

  const validated = validateExplanation(generated, facts, ranked.venue);
  return {
    pick: {
      ...ranked,
      explanation: validated.text,
      explanationSource: validated.event ? "validated-fallback" : "llm",
      facts,
    },
    blocklistEvent: validated.event,
  };
}

export async function suggestVenues(
  request: AISuggestRequest,
  venues: ConsumerVenue[],
  llm: {
    filter?: AISuggestFilterLLM;
    explain?: AISuggestExplainLLM;
  } = {},
): Promise<AISuggestResult> {
  const { filter, fallbackReason } = await getFilterFromIntent(request.intent, llm.filter);
  const ranked = filterAndRankVenues(venues, filter, {
    userLat: request.userLat,
    userLng: request.userLng,
    excludeVenueIds: request.excludeVenueIds,
    scoreJitterPercent: request.mode === "surprise" ? 0.05 : 0,
  });
  const limit = request.mode === "decide" ? 3 : 1;
  const explained = await Promise.all(ranked.slice(0, limit).map((item) => explainRankedVenue(item, llm.explain)));

  return {
    mode: request.mode,
    filter,
    filterFallbackReason: fallbackReason,
    picks: explained.map((item) => item.pick),
    blocklistEvents: explained
      .map((item) => item.blocklistEvent)
      .filter((event): event is AISuggestBlocklistEvent => Boolean(event)),
  };
}
