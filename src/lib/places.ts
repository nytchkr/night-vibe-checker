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
    maxwidth: "900",
    photo_reference: photoReference,
    key: apiKey(),
  });
  return `${PLACES_BASE}/photo?${params}`;
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
  photoUrl?: string;
};

function toDiscoveredVenue(
  result: PlacesNearbyResult,
  zone: LaunchZone,
  category: string
): DiscoveredVenue | null {
  if (!result.place_id || !result.name || !result.geometry?.location) return null;

  const photoReference = result.photos?.find((photo) => photo.photo_reference)?.photo_reference;
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
    photoUrl: photoReference ? buildPhotoUrl(photoReference) : undefined,
  };
}

export async function discoverZone(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const byPlaceId = new Map<string, DiscoveredVenue>();

  for (const type of DISCOVERY_TYPES) {
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

    for (const result of (json.results ?? []) as PlacesNearbyResult[]) {
      const venue = toDiscoveredVenue(result, zone, type);
      if (!venue || byPlaceId.has(venue.placeId)) continue;
      byPlaceId.set(venue.placeId, venue);
    }
  }

  return Array.from(byPlaceId.values());
}
