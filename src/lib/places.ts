// ============================================================
// Night Vibe Checker — Google Places API Wrapper
// SERVER-SIDE ONLY — API key must never reach the browser.
// ============================================================

import type { VenueBasic, VenueDetail } from "@/types";

// --------------- Guard against accidental client import -----

if (typeof window !== "undefined") {
  throw new Error(
    "[places.ts] This module is server-side only. Do not import it in Client Components."
  );
}

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new PlacesApiError("GOOGLE_PLACES_API_KEY is not set.", 500);
  return key;
}

// --------------- Custom error class ------------------------

export class PlacesApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

// --------------- Photo URL helper --------------------------

/**
 * Converts a Google Places photo_reference token into a fetchable URL.
 * Capped at 800px wide — sufficient for thumbnails.
 */
export function buildPhotoUrl(photoReference: string): string {
  const params = new URLSearchParams({
    maxwidth: "800",
    photo_reference: photoReference,
    key: apiKey(),
  });
  return `${PLACES_BASE}/photo?${params}`;
}

// --------------- searchVenues ------------------------------

/**
 * Search Google Places for nightlife venues matching a text query.
 * Uses the Nearby Search endpoint when lat/lng are provided (better results)
 * and falls back to Find Place from Text otherwise.
 *
 * @param query   Free-text search string, e.g. "rooftop bars in Brooklyn"
 * @param lat     Optional latitude for location bias
 * @param lng     Optional longitude for location bias
 * @returns       Array of VenueBasic, empty on no results
 */
export async function searchVenues(
  query: string,
  lat?: number,
  lng?: number
): Promise<VenueBasic[]> {
  let url: string;

  if (lat !== undefined && lng !== undefined) {
    // Nearby Search with keyword gives better geo-ranked results
    const params = new URLSearchParams({
      keyword: query,
      location: `${lat},${lng}`,
      radius: "5000",        // 5 km radius
      type: "bar",           // bias toward nightlife; also returns night_club
      key: apiKey(),
    });
    url = `${PLACES_BASE}/nearbysearch/json?${params}`;
  } else {
    // Find Place from Text — no location context
    const params = new URLSearchParams({
      input: query,
      inputtype: "textquery",
      fields:
        "place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,photos",
      key: apiKey(),
    });
    url = `${PLACES_BASE}/findplacefromtext/json?${params}`;
  }

  const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min at edge
  if (!res.ok) {
    throw new PlacesApiError(`Places search HTTP ${res.status}`, res.status);
  }

  const json = await res.json();

  if (json.status === "REQUEST_DENIED") {
    throw new PlacesApiError(`Places API denied: ${json.error_message}`, 403);
  }
  if (json.status === "OVER_QUERY_LIMIT") {
    throw new PlacesApiError("Google Places quota exceeded.", 429);
  }

  // Nearby Search returns json.results; Find Place returns json.candidates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: any[] = json.results ?? json.candidates ?? [];

  return candidates.map((c) => ({
    placeId: c.place_id,
    name: c.name,
    address: c.vicinity ?? c.formatted_address ?? "",
    lat: c.geometry?.location?.lat ?? 0,
    lng: c.geometry?.location?.lng ?? 0,
    type: Array.isArray(c.types) ? (c.types[0] ?? "establishment") : "establishment",
    googleRating: c.rating,
    totalRatings: c.user_ratings_total,
    priceLevel: c.price_level as VenueBasic["priceLevel"],
    photoReference: c.photos?.[0]?.photo_reference,
  }));
}

// --------------- getVenueDetails ---------------------------

/**
 * Fetch full details for a single venue by its Google Places ID.
 * Returns the resolved photo URLs and review snippets ready for the AI module.
 */
export async function getVenueDetails(placeId: string): Promise<VenueDetail> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: [
      "place_id",
      "name",
      "formatted_address",
      "geometry",
      "types",
      "rating",
      "user_ratings_total",
      "price_level",
      "formatted_phone_number",
      "website",
      "opening_hours",
      "editorial_summary",
      "reviews",
      "photos",
    ].join(","),
    key: apiKey(),
  });

  const res = await fetch(`${PLACES_BASE}/details/json?${params}`, {
    next: { revalidate: 600 }, // cache 10 min at edge
  });

  if (!res.ok) {
    throw new PlacesApiError(`Places details HTTP ${res.status}`, res.status);
  }

  const json = await res.json();

  if (json.status !== "OK") {
    throw new PlacesApiError(`Places API status: ${json.status}`, 502);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = json.result;

  // Resolve up to 5 photo URLs — these are public redirect URLs
  const photos: string[] = (r.photos ?? [])
    .slice(0, 5)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => buildPhotoUrl(p.photo_reference));

  // Extract review text for the AI context window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviews: string[] = (r.reviews ?? []).map((rv: any) => rv.text ?? "");

  return {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    lat: r.geometry?.location?.lat ?? 0,
    lng: r.geometry?.location?.lng ?? 0,
    type: Array.isArray(r.types) ? (r.types[0] ?? "establishment") : "establishment",
    googleRating: r.rating,
    totalRatings: r.user_ratings_total,
    priceLevel: r.price_level as VenueBasic["priceLevel"],
    photoReference: r.photos?.[0]?.photo_reference,
    phoneNumber: r.formatted_phone_number,
    website: r.website,
    openingHours: r.opening_hours?.weekday_text ?? [],
    editorialSummary: r.editorial_summary?.overview,
    photos,
    reviews,
  };
}

// --------------- getVenueReviews ---------------------------

/**
 * Convenience wrapper — returns only the review text strings for a venue.
 * Used by the AI module to build context without fetching all detail fields.
 */
export async function getVenueReviews(placeId: string): Promise<string[]> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "reviews",
    key: apiKey(),
  });

  const res = await fetch(`${PLACES_BASE}/details/json?${params}`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) return []; // non-fatal: AI falls back gracefully with no reviews

  const json = await res.json();
  if (json.status !== "OK") return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.result?.reviews ?? []).map((rv: any) => rv.text ?? "");
}
