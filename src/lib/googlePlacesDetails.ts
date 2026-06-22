import { supabaseAdmin } from "@/lib/supabase";

export const GOOGLE_PLACES_DETAILS_STATIC_FIELD_MASK = [
  "priceLevel",
  "rating",
  "userRatingCount",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "currentOpeningHours",
  "regularOpeningHours",
  "editorialSummary",
].join(",");

export const GOOGLE_PLACES_DETAILS_FIELD_MASK = [
  GOOGLE_PLACES_DETAILS_STATIC_FIELD_MASK,
  "currentPopularityScore",
].join(",");

export type PlaceDetailsVenueRow = {
  id: string;
  place_id: string | null;
  name: string;
  opening_hours?: unknown;
};

export type GooglePlacesDetailsPayload = {
  priceLevel?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  websiteUri?: string | null;
  nationalPhoneNumber?: string | null;
  googleMapsUri?: string | null;
  regularOpeningHours?: unknown;
  editorialSummary?: { text?: string | null } | null;
  currentPopularityScore?: number | null;
};

export type PlacesDetailsUpdate = {
  price_level?: number | null;
  rating?: number;
  user_rating_count?: number;
  website?: string;
  phone_number?: string;
  phone?: string;
  google_maps_uri?: string;
  current_popularity?: number;
  current_popularity_updated_at?: string;
  editorial_summary?: string;
  opening_hours?: unknown;
};

export type PlacesDetailsRefreshResult = {
  venueId: string;
  venueName: string;
  ok: boolean;
  skipped?: boolean;
  updatedFields: string[];
  popularityUpdated: boolean;
  reason?: string;
};

const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

function googlePlacesKey(): string {
  const key = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_KEY or GOOGLE_PLACES_API_KEY is not set.");
  return key;
}

export function hasValidGooglePlaceId(placeId: string | null | undefined): placeId is string {
  return typeof placeId === "string" && placeId.trim().length > 0 && !placeId.startsWith("fallback:");
}

export function normalizePlaceResourceId(placeId: string): string {
  return placeId.startsWith("places/") ? placeId.slice("places/".length) : placeId;
}

export function mapGooglePriceLevel(priceLevel: string | null | undefined): number | null | undefined {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
    case "FREE":
      return null;
    case "PRICE_LEVEL_INEXPENSIVE":
    case "INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
    case "MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
    case "EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
    case "VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number == null ? null : Math.round(number);
}

function isRicherOpeningHours(next: unknown, current: unknown): boolean {
  if (!next || typeof next !== "object" || Array.isArray(next)) return false;
  const nextRecord = next as { periods?: unknown; weekdayDescriptions?: unknown };
  const currentRecord =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as { periods?: unknown; weekdayDescriptions?: unknown })
      : null;

  const nextPeriods = Array.isArray(nextRecord.periods) ? nextRecord.periods.length : 0;
  const currentPeriods = Array.isArray(currentRecord?.periods) ? currentRecord.periods.length : 0;
  if (nextPeriods > currentPeriods) return true;

  const nextDescriptions = Array.isArray(nextRecord.weekdayDescriptions) ? nextRecord.weekdayDescriptions.length : 0;
  const currentDescriptions = Array.isArray(currentRecord?.weekdayDescriptions) ? currentRecord.weekdayDescriptions.length : 0;
  return nextDescriptions > currentDescriptions;
}

async function fetchGooglePlacesDetailsWithMask(placeId: string, fieldMask: string): Promise<GooglePlacesDetailsPayload> {
  const url = new URL(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(normalizePlaceResourceId(placeId))}`);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": googlePlacesKey(),
      "X-Goog-FieldMask": fieldMask,
    },
  });
  const payload = (await response.json().catch(() => null)) as GooglePlacesDetailsPayload & {
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Google Places HTTP ${response.status}`);
  }

  return payload ?? {};
}

export async function fetchGooglePlacesDetails(placeId: string): Promise<GooglePlacesDetailsPayload> {
  try {
    return await fetchGooglePlacesDetailsWithMask(placeId, GOOGLE_PLACES_DETAILS_FIELD_MASK);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!message.toLowerCase().includes("invalid argument")) throw err;
    return fetchGooglePlacesDetailsWithMask(placeId, GOOGLE_PLACES_DETAILS_STATIC_FIELD_MASK);
  }
}

export function buildPlacesDetailsUpdate(
  details: GooglePlacesDetailsPayload,
  currentOpeningHours?: unknown,
  refreshedAt = new Date().toISOString()
): PlacesDetailsUpdate {
  const update: PlacesDetailsUpdate = {};
  const priceLevel = mapGooglePriceLevel(details.priceLevel);
  const rating = readFiniteNumber(details.rating);
  const userRatingCount = readInteger(details.userRatingCount);
  const currentPopularity = readInteger(details.currentPopularityScore);

  if (priceLevel !== undefined) update.price_level = priceLevel;
  if (rating != null) update.rating = Number(rating.toFixed(1));
  if (userRatingCount != null) update.user_rating_count = userRatingCount;
  if (typeof details.websiteUri === "string" && details.websiteUri.trim()) update.website = details.websiteUri.trim();
  if (typeof details.nationalPhoneNumber === "string" && details.nationalPhoneNumber.trim()) {
    update.phone_number = details.nationalPhoneNumber.trim();
    update.phone = details.nationalPhoneNumber.trim();
  }
  if (typeof details.googleMapsUri === "string" && details.googleMapsUri.trim()) update.google_maps_uri = details.googleMapsUri.trim();
  if (currentPopularity != null && currentPopularity >= 0 && currentPopularity <= 100) {
    update.current_popularity = currentPopularity;
    update.current_popularity_updated_at = refreshedAt;
  }
  if (typeof details.editorialSummary?.text === "string" && details.editorialSummary.text.trim()) {
    update.editorial_summary = details.editorialSummary.text.trim();
  }
  if (isRicherOpeningHours(details.regularOpeningHours, currentOpeningHours)) {
    update.opening_hours = details.regularOpeningHours;
  }

  return update;
}

export async function refreshGooglePlacesDetailsForVenue(
  venue: PlaceDetailsVenueRow,
  options: { details?: GooglePlacesDetailsPayload; refreshStaticFields?: boolean } = {}
): Promise<PlacesDetailsRefreshResult> {
  if (!hasValidGooglePlaceId(venue.place_id)) {
    return {
      venueId: venue.id,
      venueName: venue.name,
      ok: true,
      skipped: true,
      updatedFields: [],
      popularityUpdated: false,
      reason: "Missing or fallback place_id",
    };
  }

  const refreshedAt = new Date().toISOString();
  const details = options.details ?? (await fetchGooglePlacesDetails(venue.place_id));
  const update = buildPlacesDetailsUpdate(details, venue.opening_hours, refreshedAt);
  const currentPopularity = readInteger(details.currentPopularityScore);
  const refreshStaticFields = options.refreshStaticFields ?? true;

  const venueUpdate = refreshStaticFields
    ? update
    : {
        ...(update.current_popularity == null ? {} : { current_popularity: update.current_popularity }),
        ...(update.current_popularity_updated_at == null
          ? {}
          : { current_popularity_updated_at: update.current_popularity_updated_at }),
      };

  const updatedFields = Object.keys(venueUpdate);
  if (updatedFields.length > 0) {
    const { error } = await supabaseAdmin.from("venues").update(venueUpdate).eq("id", venue.id);
    if (error) throw new Error(`Supabase venue update failed: ${error.message}`);
  }

  let popularityUpdated = false;
  if (currentPopularity != null && currentPopularity > 0 && currentPopularity <= 100) {
    const { error } = await supabaseAdmin.from("venue_signals").upsert(
      {
        venue_id: venue.id,
        place_id: venue.place_id,
        busyness_0_100: currentPopularity,
        busyness_source: "live",
        confidence_0_1: 0.85,
        computed_at: refreshedAt,
        last_busyness_refresh: refreshedAt,
      },
      { onConflict: "venue_id" }
    );
    if (error) throw new Error(`Supabase venue_signals upsert failed: ${error.message}`);
    popularityUpdated = true;
  }

  return {
    venueId: venue.id,
    venueName: venue.name,
    ok: true,
    updatedFields,
    popularityUpdated,
  };
}
