// ============================================================
// VibeCheck — Google Places launch-zone discovery
// SERVER-SIDE ONLY. GOOGLE_PLACES_API_KEY must never reach the browser.
// ============================================================

import type { LaunchZone } from "@/lib/launchZone";

if (typeof window !== "undefined") {
  throw new Error("[places.ts] Server-side only. Do not import from Client Components.");
}

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";
const DISCOVERY_TYPES = ["bar", "night_club", "restaurant"] as const;
const MAX_VENUE_PHOTOS = 3;

export class PlacesApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new PlacesApiError("GOOGLE_PLACES_API_KEY is not set.", 500);
  return key;
}

export function buildPhotoUrl(photoReference: string): string {
  const params = new URLSearchParams({
    maxwidth: "800",
    photoreference: photoReference,
    key: apiKey(),
  });
  return `${PLACES_BASE}/photo?${params}`;
}

export async function resolvePhotoUrl(photoReference: string): Promise<string> {
  return buildPhotoUrl(photoReference);
}

type PlacesNearbyResult = {
  place_id?: string;
  name?: string;
  vicinity?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  user_ratings_total?: number;
  price_level?: 1 | 2 | 3 | 4;
  photos?: { photo_reference?: string }[];
};

type PlaceDetailsResponse = {
  status?: string;
  error_message?: string;
  result?: {
    opening_hours?: {
      weekday_text?: string[];
      open_now?: boolean;
    };
    photos?: { photo_reference?: string }[];
  };
};

export type DiscoveredVenue = {
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  googleRating?: number;
  totalRatings?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  photoReference?: string;
  photoReferences?: string[];
  photoUrl?: string;
  photoUrls?: string[];
  openingHours?: string[];
  openNow?: boolean;
};

function toDiscoveredVenue(
  result: PlacesNearbyResult,
  zone: LaunchZone,
  category: string
): DiscoveredVenue | null {
  if (!result.place_id || !result.name || !result.geometry?.location) return null;

  const photoReferences = (result.photos ?? [])
    .map((photo) => photo.photo_reference)
    .filter((reference): reference is string => Boolean(reference))
    .slice(0, MAX_VENUE_PHOTOS);
  const photoReference = photoReferences[0];
  return {
    placeId: result.place_id,
    zoneId: zone.id,
    name: result.name,
    address: result.vicinity ?? result.formatted_address ?? "",
    lat: result.geometry.location.lat ?? 0,
    lng: result.geometry.location.lng ?? 0,
    category,
    googleRating: result.rating,
    totalRatings: result.user_ratings_total,
    priceLevel: result.price_level,
    photoReference,
    photoReferences,
    // Photo URLs resolved asynchronously in discoverZone after dedup.
    photoUrl: undefined,
    photoUrls: undefined,
  };
}

async function fetchPlaceDetails(
  placeId: string
): Promise<{ openingHours?: string[]; openNow?: boolean; photoReferences?: string[] }> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "opening_hours,photos",
    key: apiKey(),
  });

  const res = await fetch(`${PLACES_BASE}/details/json?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new PlacesApiError(`Place details HTTP ${res.status}`, res.status);

  const json = (await res.json()) as PlaceDetailsResponse;
  if (json.status === "REQUEST_DENIED") {
    throw new PlacesApiError(`Places API denied: ${json.error_message}`, 403);
  }
  if (json.status === "OVER_QUERY_LIMIT") {
    throw new PlacesApiError("Google Places quota exceeded.", 429);
  }
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new PlacesApiError(`Places details status: ${json.status}`, 502);
  }

  const weekdayText = json.result?.opening_hours?.weekday_text;
  const openingHours = Array.isArray(weekdayText)
    ? weekdayText.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : undefined;
  const photoReferences = (json.result?.photos ?? [])
    .map((photo) => photo.photo_reference)
    .filter((reference): reference is string => Boolean(reference))
    .slice(0, MAX_VENUE_PHOTOS);

  return {
    openingHours: openingHours?.length ? openingHours : undefined,
    openNow: json.result?.opening_hours?.open_now,
    photoReferences: photoReferences.length ? photoReferences : undefined,
  };
}

async function discoverLegacyType(
  zone: LaunchZone,
  type: (typeof DISCOVERY_TYPES)[number]
): Promise<DiscoveredVenue[]> {
  const params = new URLSearchParams({
    location: `${zone.center_lat},${zone.center_lng}`,
    radius: String(zone.radius_m),
    type,
    key: apiKey(),
  });

  const res = await fetch(`${PLACES_BASE}/nearbysearch/json?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new PlacesApiError(`Places discovery HTTP ${res.status}`, res.status);

  const json = await res.json();
  if (json.status === "REQUEST_DENIED") {
    throw new PlacesApiError(`Places API denied: ${json.error_message}`, 403);
  }
  if (json.status === "OVER_QUERY_LIMIT") {
    throw new PlacesApiError("Google Places quota exceeded.", 429);
  }
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new PlacesApiError(`Places API status: ${json.status}`, 502);
  }

  return ((json.results ?? []) as PlacesNearbyResult[])
    .map((result) => toDiscoveredVenue(result, zone, type))
    .filter((venue): venue is DiscoveredVenue => Boolean(venue));
}

async function discoverNearbySearch(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const venues: DiscoveredVenue[] = [];
  for (const type of DISCOVERY_TYPES) {
    venues.push(...(await discoverLegacyType(zone, type)));
  }
  return venues;
}

export async function discoverZone(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const byPlaceId = new Map<string, DiscoveredVenue>();

  for (const venue of await discoverNearbySearch(zone)) {
    if (byPlaceId.has(venue.placeId)) continue;
    byPlaceId.set(venue.placeId, venue);
  }

  const venues = Array.from(byPlaceId.values());

  // Store real Google Place Photo URLs after dedup so we only hydrate each unique venue once.
  await Promise.all(
    venues.map(async (venue) => {
      let photoReferences = (venue.photoReferences?.length ? venue.photoReferences : [venue.photoReference])
        .filter((reference): reference is string => Boolean(reference))
        .slice(0, MAX_VENUE_PHOTOS);
      try {
        const details = await fetchPlaceDetails(venue.placeId);
        venue.openingHours = details.openingHours;
        venue.openNow = details.openNow;
        if (details.photoReferences?.length) {
          photoReferences = details.photoReferences;
          venue.photoReference = details.photoReferences[0];
        }
      } catch {
        venue.openingHours = undefined;
        venue.openNow = undefined;
      }
      if (venue.photoReference) {
        venue.photoUrl = await resolvePhotoUrl(venue.photoReference);
      }
      venue.photoUrls = photoReferences.map((reference) => buildPhotoUrl(reference));
    })
  );

  return venues;
}
