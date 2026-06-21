import { supabaseAdmin } from "../src/lib/supabase";

type VenuePhotoRow = {
  id: string;
  place_id: string;
  name: string;
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

const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const GOOGLE_PLACE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const MAX_PHOTOS = 3;
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

function buildPhotoUrl(photoReference: string, apiKey: string): string {
  const url = new URL(GOOGLE_PLACE_PHOTO_URL);
  url.searchParams.set("maxwidth", "800");
  url.searchParams.set("photoreference", photoReference);
  url.searchParams.set("key", apiKey);
  return url.toString();
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

async function main(): Promise<void> {
  const googlePlacesApiKey = requiredEnv("GOOGLE_PLACES_API_KEY");

  const { data: venues, error: fetchError } = await supabaseAdmin
    .from("venues")
    .select("id,place_id,name,photo_urls")
    .not("place_id", "is", null)
    .order("name", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch venues: ${fetchError.message}`);
  }

  for (const venue of (venues ?? []) as VenuePhotoRow[]) {
    if (Array.isArray(venue.photo_urls) && venue.photo_urls.length >= MAX_PHOTOS) {
      console.log(`Skipping ${venue.name}: already has ${venue.photo_urls.length} photos`);
      continue;
    }

    const details = await fetchPlacePhotos(venue.place_id, googlePlacesApiKey);

    if (details.status !== "OK") {
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

    const { error: updateError } = await supabaseAdmin
      .from("venues")
      .update({ photo_urls: photoUrls })
      .eq("id", venue.id);

    if (updateError) {
      throw new Error(`Failed to update ${venue.name}: ${updateError.message}`);
    }

    console.log(`Updated ${venue.name}: ${photoUrls.length} photo URLs`);
    await delay(REQUEST_DELAY_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
