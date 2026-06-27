import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

type CheckInVenueRow = {
  venue_id: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rate = publicRateLimit(req, "stats-tonight", 60);
  if (rate.response) return rate.response;
  const headers = { ...CACHE_HEADERS, ...rate.headers };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error, count } = await supabase
    .from("check_ins")
    .select("venue_id", { count: "exact" })
    .gt("created_at", since);

  if (error) {
    console.warn("[stats/tonight] Failed to load check-in stats:", error);
    return NextResponse.json(
      { checkInsTonight: 0, venuesActive: 0 },
      { status: 500, headers }
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
    { headers }
  );
}
