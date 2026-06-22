import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
};

type CheckInVenueRow = {
  venue_id: string | null;
};

export async function GET(): Promise<NextResponse> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error, count } = await supabase
    .from("check_ins")
    .select("venue_id", { count: "exact" })
    .gt("created_at", since);

  if (error) {
    console.warn("[stats/tonight] Failed to load check-in stats:", error);
    return NextResponse.json(
      { checkInsTonight: 0, venuesActive: 0 },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const venueIds = new Set(
    ((data ?? []) as CheckInVenueRow[])
      .map((row) => row.venue_id)
      .filter((venueId): venueId is string => Boolean(venueId))
  );

  return NextResponse.json(
    {
      checkInsTonight: count ?? data?.length ?? 0,
      venuesActive: venueIds.size,
    },
    { headers: CACHE_HEADERS }
  );
}
