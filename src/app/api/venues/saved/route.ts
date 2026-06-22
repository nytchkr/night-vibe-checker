import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse, ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

type SavedVenueRow = {
  venue_id: string;
  alert_threshold: number | null;
  created_at: string | null;
};

export type SavedVenueWithBusyness = {
  venueId: string;
  placeId: string | null;
  alertThreshold: number;
  createdAt: string | null;
  currentBusyness: number | null;
  venue: ConsumerVenue | null;
};

function configError(error: unknown) {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let userId: string | null;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (error) {
    const response = configError(error);
    if (response) return response;
    throw error;
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("saved_venues")
    .select("venue_id, alert_threshold, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[venues saved GET] DB error:", error);
    return NextResponse.json({ error: "Could not fetch saved venues." }, { status: 500 });
  }

  const rows = (data ?? []) as SavedVenueRow[];
  const savedVenues = await Promise.all(rows.map(async (row): Promise<SavedVenueWithBusyness> => {
    const venue = await getConsumerVenueById(row.venue_id);
    return {
      venueId: row.venue_id,
      placeId: venue?.placeId ?? null,
      alertThreshold: row.alert_threshold ?? 70,
      createdAt: row.created_at,
      currentBusyness: venue?.signal?.busyness0To100 ?? null,
      venue,
    };
  }));

  const venueIds = savedVenues.map((item) => item.venueId);
  const placeIds = savedVenues.map((item) => item.placeId).filter((id): id is string => Boolean(id));

  return NextResponse.json<APIResponse<{ savedVenues: SavedVenueWithBusyness[]; savedVenueIds: string[]; placeIds: string[] }> & {
    savedVenues: SavedVenueWithBusyness[];
    savedVenueIds: string[];
    venueIds: string[];
    place_ids: string[];
  }>({
    status: "success",
    savedVenues,
    savedVenueIds: venueIds,
    venueIds,
    place_ids: placeIds,
    data: { savedVenues, savedVenueIds: venueIds, placeIds },
    meta: { cached: false, generatedAt: new Date().toISOString() },
  });
}
