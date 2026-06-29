import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { sql } from "@/lib/db";
import type { APIResponse, ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

type SavedVenueRow = {
  venue_id: string;
  alert_threshold: number | null;
  created_at: string | null;
};

type SavedVenue = {
  id: string;
  venueId: string;
  placeId: string | null;
  name: string;
  category: string;
  alertThreshold: number;
  savedAt: string | null;
  createdAt: string | null;
  currentBusyness: number | null;
  openNow: boolean | null;
  photoUrl?: string;
  photoUrls?: string[];
  venue: ConsumerVenue | null;
};

type SavedVenuesPayload = {
  savedVenues: SavedVenue[];
  savedVenueIds: string[];
  placeIds: string[];
};

type SavedVenuesResponse = APIResponse<SavedVenuesPayload> & {
  savedVenues: SavedVenue[];
  savedVenueIds: string[];
  venueIds: string[];
  place_ids: string[];
};

function readPhotoUrls(venue: ConsumerVenue | null): string[] {
  const urls = new Set<string>();
  if (venue?.photoUrl) urls.add(venue.photoUrl);
  for (const item of venue?.photoUrls ?? venue?.photo_urls ?? []) {
    if (typeof item === "string" && item.length > 0) urls.add(item);
  }
  return Array.from(urls);
}

async function getUserId(req: NextRequest): Promise<string | null> {
  return getAuthenticatedUserId(req);
}

export async function GET(req: NextRequest): Promise<NextResponse<SavedVenuesResponse | { error: string }>> {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const rows = (await sql`
    SELECT venue_id, alert_threshold, created_at
    FROM saved_venues
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `) as SavedVenueRow[];

  const savedVenues = await Promise.all(rows.map(async (row): Promise<SavedVenue> => {
    const venue = await getConsumerVenueById(row.venue_id);
    const photoUrls = readPhotoUrls(venue);

    return {
      id: venue?.id ?? row.venue_id,
      venueId: row.venue_id,
      placeId: venue?.placeId ?? null,
      name: venue?.name?.trim() || "Saved venue",
      category: venue?.category?.trim() || "Venue",
      alertThreshold: row.alert_threshold ?? 70,
      savedAt: row.created_at,
      createdAt: row.created_at,
      currentBusyness: venue?.signal?.busyness0To100 ?? null,
      openNow: venue?.openNow ?? venue?.open_now ?? null,
      ...(photoUrls.length > 0 ? { photoUrl: photoUrls[0], photoUrls } : {}),
      venue,
    };
  }));

  const savedVenueIds = savedVenues.map((item) => item.venueId);
  const placeIds = savedVenues.map((item) => item.placeId).filter((id): id is string => Boolean(id));

  return NextResponse.json({
    status: "success",
    savedVenues,
    savedVenueIds,
    venueIds: savedVenueIds,
    place_ids: placeIds,
    data: { savedVenues, savedVenueIds, placeIds },
    meta: { cached: false, generatedAt: new Date().toISOString() },
  }, { headers: { "Cache-Control": "no-store" } });
}
