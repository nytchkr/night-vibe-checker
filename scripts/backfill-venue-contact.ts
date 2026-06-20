import { supabaseAdmin } from "../src/lib/supabase";

type VenueContactRow = {
  id: string;
  place_id: string;
  name: string;
  phone: string | null;
  website: string | null;
};

type PlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    formatted_phone_number?: string;
    website?: string;
  };
};

const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const CONTACT_FIELDS = "formatted_phone_number,website";
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

async function fetchPlaceContact(placeId: string, apiKey: string): Promise<PlaceDetailsResponse> {
  const url = new URL(GOOGLE_PLACES_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", CONTACT_FIELDS);
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
    .select("id,place_id,name,phone,website")
    .or("phone.is.null,website.is.null")
    .not("place_id", "is", null)
    .order("name", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch venues: ${fetchError.message}`);
  }

  for (const venue of (venues ?? []) as VenueContactRow[]) {
    const details = await fetchPlaceContact(venue.place_id, googlePlacesApiKey);

    if (details.status !== "OK") {
      console.warn(
        `No data for ${venue.name} (Places status=${details.status}${details.error_message ? `: ${details.error_message}` : ""})`,
      );
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const phone = details.result?.formatted_phone_number;
    const website = details.result?.website;
    const update: Partial<Pick<VenueContactRow, "phone" | "website">> = {};

    if (venue.phone === null && phone) update.phone = phone;
    if (venue.website === null && website) update.website = website;

    if (Object.keys(update).length === 0) {
      console.log(`No data for ${venue.name}`);
      await delay(REQUEST_DELAY_MS);
      continue;
    }

    const { error: updateError } = await supabaseAdmin.from("venues").update(update).eq("id", venue.id);
    if (updateError) {
      throw new Error(`Failed to update ${venue.name}: ${updateError.message}`);
    }

    console.log(`Updated ${venue.name}: phone=${update.phone ?? venue.phone}, website=${update.website ?? venue.website}`);
    await delay(REQUEST_DELAY_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
