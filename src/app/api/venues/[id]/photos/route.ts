import { NextRequest, NextResponse } from "next/server";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { hasValidGooglePlaceId, normalizePlaceResourceId } from "@/lib/googlePlacesDetails";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600",
};

type GooglePlacePhoto = {
  name?: string;
};

type GooglePlacePhotosResponse = {
  photos?: GooglePlacePhoto[];
  error?: {
    message?: string;
  };
};

function googlePlacesKey(): string | null {
  return process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
}

function photosResponse(photos: string[] = [], status = 200): NextResponse {
  return NextResponse.json({ photos }, { status, headers: CACHE_HEADERS });
}

function buildPhotoProxyUrl(request: NextRequest, venueId: string, photoName: string): string {
  const url = new URL(`/api/venues/${encodeURIComponent(venueId)}/photos`, request.url);
  url.searchParams.set("name", photoName);
  return `${url.pathname}${url.search}`;
}

async function fetchPhotoNames(placeId: string, key: string): Promise<string[]> {
  const normalizedPlaceId = normalizePlaceResourceId(placeId);
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`);
  url.searchParams.set("fields", "photos");
  url.searchParams.set("key", key);

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  const payload = (await response.json().catch(() => null)) as GooglePlacePhotosResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Google Places photos HTTP ${response.status}`);
  }

  return (payload?.photos ?? [])
    .map((photo) => photo.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .slice(0, 5);
}

async function proxyPhotoMedia(photoName: string, key: string): Promise<NextResponse> {
  const normalizedPhotoName = photoName.replace(/^\/+/, "");
  if (!/^places\/[^/?#]+\/photos\/[^/?#]+$/.test(normalizedPhotoName)) {
    return new NextResponse(null, { status: 400, headers: CACHE_HEADERS });
  }

  const url = new URL(`https://places.googleapis.com/v1/${normalizedPhotoName}/media`);
  url.searchParams.set("maxWidthPx", "800");
  url.searchParams.set("key", key);

  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 3600 },
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    return new NextResponse(null, { status: response.status || 502, headers: CACHE_HEADERS });
  }

  const headers = new Headers(CACHE_HEADERS);
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  return new NextResponse(response.body, {
    status: 200,
    headers,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const key = googlePlacesKey();
  if (!key) return photosResponse();

  const { id } = await params;
  const photoName = request.nextUrl.searchParams.get("name");
  if (photoName) return proxyPhotoMedia(photoName, key);

  const venue = await getConsumerVenueById(id);
  if (!venue || !hasValidGooglePlaceId(venue.placeId)) return photosResponse();

  try {
    const photoNames = await fetchPhotoNames(venue.placeId, key);
    return photosResponse(photoNames.map((name) => buildPhotoProxyUrl(request, id, name)));
  } catch {
    return photosResponse();
  }
}
