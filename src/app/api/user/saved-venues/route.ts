import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { inferCanonicalOpenNow } from "@/lib/openNow";

export const dynamic = "force-dynamic";

type SavedVenueRow = {
  venue_id: string;
  created_at: string;
};

type VenueRow = {
  id: string;
  place_id: string | null;
  name: string | null;
  category: string | null;
  venue_type: string | null;
  open_now: boolean | null;
  opening_hours: unknown;
  photo_url: string | string[] | null;
  photo_urls: string[] | null;
};

type SavedVenue = {
  id: string;
  name: string;
  category: string;
  openNow: boolean | null;
  photoUrl?: string;
  photoUrls?: string[];
};

type SavedVenuesResponse = {
  savedVenues: SavedVenue[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getUserId(req: NextRequest): Promise<string | null> {
  return getAuthenticatedUserId(req);
}

async function loadVenues(savedVenueIds: string[]): Promise<Map<string, VenueRow>> {
  const venueMap = new Map<string, VenueRow>();
  const uuidIds = savedVenueIds.filter((id) => UUID_RE.test(id));

  if (uuidIds.length > 0) {
    const data = (await sql`
      SELECT id, place_id, name, category, venue_type, open_now, opening_hours, photo_url, photo_urls
      FROM venues
      WHERE id = ANY(${uuidIds}::uuid[])
    `) as VenueRow[];
    for (const venue of data) {
      venueMap.set(venue.id, venue);
      if (venue.place_id) venueMap.set(venue.place_id, venue);
    }
  }

  const data = (await sql`
    SELECT id, place_id, name, category, venue_type, open_now, opening_hours, photo_url, photo_urls
    FROM venues
    WHERE place_id = ANY(${savedVenueIds}::text[])
  `) as VenueRow[];
  for (const venue of data) {
    venueMap.set(venue.id, venue);
    if (venue.place_id) venueMap.set(venue.place_id, venue);
  }

  return venueMap;
}

function readPhotoUrls(venue: VenueRow | undefined): string[] {
  if (!venue) return [];

  const urls = new Set<string>();
  const photoUrl = venue.photo_url;
  if (typeof photoUrl === "string" && photoUrl.length > 0) urls.add(photoUrl);
  if (Array.isArray(photoUrl)) {
    for (const item of photoUrl) {
      if (typeof item === "string" && item.length > 0) urls.add(item);
    }
  }
  for (const item of venue.photo_urls ?? []) {
    if (typeof item === "string" && item.length > 0) urls.add(item);
  }

  return Array.from(urls);
}

export async function GET(req: NextRequest): Promise<NextResponse<SavedVenuesResponse | { error: string }>> {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const savedRows = await sql`
    SELECT venue_id, created_at
    FROM saved_venues
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const rows = savedRows as SavedVenueRow[];
  const venueIds = rows.map((row) => row.venue_id).filter(Boolean);
  const venuesById = venueIds.length > 0 ? await loadVenues(venueIds) : new Map<string, VenueRow>();

  const savedVenues = rows.map((row) => {
    const venue = venuesById.get(row.venue_id);
    const category = venue?.category?.trim() || venue?.venue_type?.trim() || "Venue";
    const photoUrls = readPhotoUrls(venue);

    return {
      id: venue?.id ?? row.venue_id,
      name: venue?.name?.trim() || row.venue_id,
      category,
      openNow: venue
        ? inferCanonicalOpenNow({
            category,
            openingHours: venue.opening_hours,
            refreshedAt: null,
          }) ?? venue.open_now ?? null
        : null,
      ...(photoUrls.length > 0 ? { photoUrl: photoUrls[0], photoUrls } : {}),
    };
  });

  return NextResponse.json({ savedVenues }, { headers: { "Cache-Control": "no-store" } });
}
