import { supabaseAdmin } from "../src/lib/supabase";

type SearchType = "bar" | "night_club";

type NearbySearchResult = {
  place_id?: string;
  name?: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  user_ratings_total?: number;
  price_level?: 1 | 2 | 3 | 4;
  photos?: { photo_reference?: string }[];
  types?: string[];
};

type NearbySearchResponse = {
  status: string;
  error_message?: string;
  next_page_token?: string;
  results?: NearbySearchResult[];
};

type PlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    formatted_phone_number?: string;
    website?: string;
    opening_hours?: {
      open_now?: boolean;
      weekday_text?: string[];
    };
  };
};

type VenueInsert = {
  place_id: string;
  zone_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  venue_type: SearchType;
  category: SearchType;
  google_rating: number | null;
  rating: number | null;
  total_ratings: number | null;
  price_level: 1 | 2 | 3 | 4 | null;
  photo_reference: string | null;
  photo_url: string | null;
  phone: string | null;
  website: string | null;
  opening_hours: string[] | null;
  open_now: boolean | null;
  updated_at: string;
};

const GOOGLE_PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const CONTACT_FIELDS = "formatted_phone_number,website,opening_hours";
const SEARCH_TYPES: SearchType[] = ["bar", "night_club"];
const LOCATION = "35.2178,-80.8597";
const RADIUS_M = "1500";
const ZONE_ID = "south-end-charlotte";
const REQUEST_DELAY_MS = 100;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNearby(type: SearchType, apiKey: string): Promise<NearbySearchResponse> {
  const url = new URL(GOOGLE_PLACES_NEARBY_URL);
  url.searchParams.set("location", LOCATION);
  url.searchParams.set("radius", RADIUS_M);
  url.searchParams.set("type", type);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places Nearby Search failed for ${type} with HTTP ${response.status}`);
  }

  return (await response.json()) as NearbySearchResponse;
}

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsResponse> {
  const url = new URL(GOOGLE_PLACES_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", CONTACT_FIELDS);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places Details failed for ${placeId} with HTTP ${response.status}`);
  }

  return (await response.json()) as PlaceDetailsResponse;
}

function assertPlacesStatus(response: NearbySearchResponse, type: SearchType): void {
  if (response.status === "OK" || response.status === "ZERO_RESULTS") return;
  throw new Error(
    `Google Places Nearby Search for ${type} returned ${response.status}${
      response.error_message ? `: ${response.error_message}` : ""
    }`,
  );
}

function toVenueInsert(
  result: NearbySearchResult,
  type: SearchType,
  details: PlaceDetailsResponse,
  now: string,
): VenueInsert | null {
  const placeId = result.place_id;
  const name = result.name;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (!placeId || !name || lat == null || lng == null) return null;

  const photoReference = result.photos?.find((photo) => photo.photo_reference)?.photo_reference ?? null;
  const phone = details.status === "OK" ? details.result?.formatted_phone_number ?? null : null;
  const website = details.status === "OK" ? details.result?.website ?? null : null;
  const openingHours = details.status === "OK" ? details.result?.opening_hours?.weekday_text ?? null : null;
  const openNow = details.status === "OK" ? details.result?.opening_hours?.open_now ?? null : null;
  const googleRating = result.rating ?? null;

  return {
    place_id: placeId,
    zone_id: ZONE_ID,
    name,
    address: result.vicinity ?? result.formatted_address ?? "",
    lat,
    lng,
    venue_type: type,
    category: type,
    google_rating: googleRating,
    rating: googleRating,
    total_ratings: result.user_ratings_total ?? null,
    price_level: result.price_level ?? null,
    photo_reference: photoReference,
    photo_url: null,
    phone,
    website,
    opening_hours: openingHours,
    open_now: openNow,
    updated_at: now,
  };
}

async function getExistingPlaceIds(placeIds: string[]): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();

  const { data, error } = await supabaseAdmin.from("venues").select("place_id").in("place_id", placeIds);
  if (error) {
    throw new Error(`Failed to check existing venues: ${error.message}`);
  }

  const existingIds = ((data ?? []) as Array<{ place_id: string | null }>)
    .map((row) => row.place_id)
    .filter((placeId): placeId is string => typeof placeId === "string" && placeId.length > 0);

  return new Set(existingIds);
}

async function getTotalVenueCount(): Promise<number> {
  const { count, error } = await supabaseAdmin.from("venues").select("id", { count: "exact", head: true });
  if (error) {
    throw new Error(`Failed to count venues: ${error.message}`);
  }

  return count ?? 0;
}

async function main(): Promise<void> {
  const googlePlacesApiKey = requiredEnv("GOOGLE_PLACES_API_KEY");
  const byPlaceId = new Map<string, { result: NearbySearchResult; type: SearchType }>();

  for (const type of SEARCH_TYPES) {
    const response = await fetchNearby(type, googlePlacesApiKey);
    assertPlacesStatus(response, type);

    for (const result of response.results ?? []) {
      if (!result.place_id || byPlaceId.has(result.place_id)) continue;
      byPlaceId.set(result.place_id, { result, type });
    }
  }

  const placeIds = Array.from(byPlaceId.keys());
  const existingPlaceIds = await getExistingPlaceIds(placeIds);
  const rowsToInsert: VenueInsert[] = [];
  const now = new Date().toISOString();

  for (const [placeId, entry] of byPlaceId.entries()) {
    if (existingPlaceIds.has(placeId)) continue;

    const details = await fetchPlaceDetails(placeId, googlePlacesApiKey);
    if (details.status !== "OK") {
      console.warn(
        `Details unavailable for ${entry.result.name ?? placeId} (Places status=${details.status}${
          details.error_message ? `: ${details.error_message}` : ""
        })`,
      );
    }

    const row = toVenueInsert(entry.result, entry.type, details, now);
    if (row) rowsToInsert.push(row);
    await delay(REQUEST_DELAY_MS);
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabaseAdmin.from("venues").insert(rowsToInsert);
    if (error) {
      throw new Error(`Failed to insert venues: ${error.message}`);
    }
  }

  const totalCount = await getTotalVenueCount();
  console.log(`Added ${rowsToInsert.length} new venues.`);
  console.log(`${existingPlaceIds.size} already existed.`);
  console.log(`Total venue count: ${totalCount}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
