import { supabaseAdmin } from "../src/lib/supabase";

type VenuePhotoRow = {
  id: string;
  place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  photo_urls: string[] | null;
};

type PlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    photos?: Array<{
      photo_reference?: string;
    }>;
  };
};

type TextSearchResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type BackfillSummary = {
  candidates: number;
  resolvedPlaceIds: number;
  enriched: number;
  skippedNoPhotos: number;
  skippedNoSafeMatch: number;
  failed: number;
};

const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const MAX_PHOTOS = 3;
const REQUEST_DELAY_MS = 100;
const MAX_SAFE_MATCH_DISTANCE_M = 2500;

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

function buildPhotoUrl(photoReference: string, apiKey: string): string {
  const url = new URL(GOOGLE_PLACE_PHOTO_URL);
  url.searchParams.set("maxwidth", "800");
  url.searchParams.set("photoreference", photoReference);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(the|co|company|brewery|brewing|bar|charlotte|nc|n c|llc|inc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function streetAddress(value: string | null | undefined): string {
  return normalizeComparable((value ?? "").split(",")[0] ?? "");
}

function distanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const fromLatRadians = toRadians(fromLat);
  const toLatRadians = toRadians(toLat);
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLatRadians) * Math.cos(toLatRadians) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isSafeResolvedMatch(
  venue: VenuePhotoRow,
  candidate: NonNullable<TextSearchResponse["results"]>[number],
): boolean {
  if (!candidate.name || !candidate.place_id) return false;

  const venueName = normalizeComparable(venue.name);
  const candidateName = normalizeComparable(candidate.name);
  const namesMatch = candidateName.includes(venueName) || venueName.includes(candidateName);
  if (!namesMatch) return false;

  const candidateLocation = candidate.geometry?.location;
  const distance =
    venue.lat != null && venue.lng != null && candidateLocation?.lat != null && candidateLocation.lng != null
      ? distanceMeters(venue.lat, venue.lng, candidateLocation.lat, candidateLocation.lng)
      : Number.POSITIVE_INFINITY;
  const addressesMatch =
    streetAddress(venue.address).length > 0 &&
    streetAddress(venue.address) === streetAddress(candidate.formatted_address);

  return addressesMatch || distance <= MAX_SAFE_MATCH_DISTANCE_M;
}

async function fetchPlacePhotos(placeId: string, apiKey: string): Promise<PlaceDetailsResponse> {
  const url = new URL(GOOGLE_PLACES_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "photos");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as PlaceDetailsResponse;
}

async function resolveGooglePlaceId(venue: VenuePhotoRow, apiKey: string): Promise<string | null> {
  const url = new URL(GOOGLE_PLACES_TEXT_SEARCH_URL);
  url.searchParams.set("query", `${venue.name} ${venue.address ?? ""} Charlotte NC`);
  if (venue.lat != null && venue.lng != null) {
    url.searchParams.set("location", `${venue.lat},${venue.lng}`);
    url.searchParams.set("radius", "1500");
  }
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places Text Search failed with HTTP ${response.status}`);
  }

  const json = (await response.json()) as TextSearchResponse;
  if (json.status !== "OK") {
    return null;
  }

  return json.results?.find((candidate) => isSafeResolvedMatch(venue, candidate))?.place_id ?? null;
}

async function main(): Promise<void> {
  const googlePlacesApiKey = requiredEnv("GOOGLE_PLACES_API_KEY");
  const summary: BackfillSummary = {
    candidates: 0,
    resolvedPlaceIds: 0,
    enriched: 0,
    skippedNoPhotos: 0,
    skippedNoSafeMatch: 0,
    failed: 0,
  };

  const { data: venues, error: fetchError } = await supabaseAdmin
    .from("venues")
    .select("id,place_id,name,address,lat,lng,photo_url,photo_urls")
    .not("place_id", "is", null)
    .or("photo_url.is.null,photo_url.ilike.%unsplash%")
    .order("name", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch venues: ${fetchError.message}`);
  }

  for (const venue of (venues ?? []) as VenuePhotoRow[]) {
    summary.candidates += 1;

    let placeId = venue.place_id;
    let details = await fetchPlacePhotos(placeId, googlePlacesApiKey);

    if (details.status === "INVALID_REQUEST" && venue.place_id.startsWith("fallback:")) {
      const resolvedPlaceId = await resolveGooglePlaceId(venue, googlePlacesApiKey);
      if (!resolvedPlaceId) {
        summary.skippedNoSafeMatch += 1;
        console.warn(`No safe Google Place match for ${venue.name}`);
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      placeId = resolvedPlaceId;
      summary.resolvedPlaceIds += 1;
      details = await fetchPlacePhotos(placeId, googlePlacesApiKey);
    }

    if (details.status !== "OK") {
      summary.failed += 1;
      console.warn(
        `No photos for ${venue.name} (Places status=${details.status}${details.error_message ? `: ${details.error_message}` : ""})`,
      );
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const photoUrls = (details.result?.photos ?? [])
      .map((photo) => photo.photo_reference)
      .filter((reference): reference is string => Boolean(reference))
      .slice(0, MAX_PHOTOS)
      .map((reference) => buildPhotoUrl(reference, googlePlacesApiKey));

    if (photoUrls.length === 0) {
      summary.skippedNoPhotos += 1;
      console.warn(`No photo references for ${venue.name}`);
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("venues")
      .update({
        place_id: venue.place_id.startsWith("fallback:") ? placeId : venue.place_id,
        photo_url: photoUrls[0],
        photo_urls: photoUrls,
      })
      .eq("id", venue.id);

    if (updateError) {
      summary.failed += 1;
      throw new Error(`Failed to update ${venue.name}: ${updateError.message}`);
    }

    summary.enriched += 1;
    console.log(`Updated ${venue.name}: ${photoUrls.length} Google Places photo URLs`);
    await delay(REQUEST_DELAY_MS);
  }

  console.log(`SUMMARY ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
