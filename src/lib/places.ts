// ============================================================
// VibeCheck — Google Places launch-zone discovery
// SERVER-SIDE ONLY. GOOGLE_PLACES_API_KEY must never reach the browser.
// ============================================================

import type { LaunchZone } from "@/lib/launchZone";

if (typeof window !== "undefined") {
  throw new Error("[places.ts] Server-side only. Do not import from Client Components.");
}

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";
const PLACES_NEW_BASE = "https://places.googleapis.com/v1";
const DISCOVERY_TYPES = ["bar", "night_club"] as const;

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
  if (photoReference.startsWith("places/")) {
    const params = new URLSearchParams({
      maxWidthPx: "800",
      key: apiKey(),
    });
    return `${PLACES_NEW_BASE}/${photoReference}/media?${params}`;
  }

  const params = new URLSearchParams({
    maxwidth: "800",
    photo_reference: photoReference,
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

type PlacesNewNearbyResult = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: { name?: string }[];
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
    // photoUrl resolved asynchronously in discoverZone after dedup
    photoUrl: undefined,
  };
}

function mapPriceLevel(priceLevel?: string): DiscoveredVenue["priceLevel"] {
  switch (priceLevel) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
}

function categoryFromNewTypes(types?: string[]): string {
  if (types?.includes("night_club")) return "night_club";
  if (types?.includes("bar")) return "bar";
  return "bar";
}

function toDiscoveredVenueFromNew(result: PlacesNewNearbyResult, zone: LaunchZone): DiscoveredVenue | null {
  if (!result.id || !result.displayName?.text || !result.location) return null;

  const photoReference = result.photos?.find((photo) => photo.name)?.name;
  return {
    placeId: result.id,
    zoneId: zone.id,
    name: result.displayName.text,
    address: result.formattedAddress ?? "",
    lat: result.location.latitude ?? 0,
    lng: result.location.longitude ?? 0,
    category: categoryFromNewTypes(result.types),
    googleRating: result.rating,
    totalRatings: result.userRatingCount,
    priceLevel: mapPriceLevel(result.priceLevel),
    photoReference,
    photoUrl: undefined,
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

async function discoverLegacy(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const venues: DiscoveredVenue[] = [];
  for (const type of DISCOVERY_TYPES) {
    venues.push(...(await discoverLegacyType(zone, type)));
  }
  return venues;
}

function shouldFallbackToLegacy(status: number): boolean {
  return status === 401 || status === 403;
}

async function discoverNew(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const res = await fetch(`${PLACES_NEW_BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.types,places.formattedAddress,places.location,places.rating,places.priceLevel,places.photos",
    },
    body: JSON.stringify({
      includedTypes: [...DISCOVERY_TYPES],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude: zone.center_lat,
            longitude: zone.center_lng,
          },
          radius: zone.radius_m,
        },
      },
    }),
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) {
    if (shouldFallbackToLegacy(res.status)) return discoverLegacy(zone);

    const message = json?.error?.message ?? `Places API (New) HTTP ${res.status}`;
    throw new PlacesApiError(`Places API (New) failed: ${message}`, res.status);
  }

  return ((json.places ?? []) as PlacesNewNearbyResult[])
    .map((result) => toDiscoveredVenueFromNew(result, zone))
    .filter((venue): venue is DiscoveredVenue => Boolean(venue));
}

export async function discoverZone(zone: LaunchZone): Promise<DiscoveredVenue[]> {
  const byPlaceId = new Map<string, DiscoveredVenue>();

  for (const venue of await discoverNew(zone)) {
    if (byPlaceId.has(venue.placeId)) continue;
    byPlaceId.set(venue.placeId, venue);
  }

  const venues = Array.from(byPlaceId.values());

  // Resolve one real CDN photo URL per venue by following the Places redirect.
  // We do this after dedup so we only make one photo request per unique venue.
  await Promise.all(
    venues.map(async (venue) => {
      if (venue.photoReference) {
        venue.photoUrl = await resolvePhotoUrl(venue.photoReference);
      }
    })
  );

  return venues;
}
