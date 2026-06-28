import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

type CheckInVenueRow = {
  venue_id: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rate = await publicRateLimit(req, "stats-tonight", 60);
  if (rate.response) return rate.response;
  const headers = { ...CACHE_HEADERS, ...rate.headers };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const data = await sql`
    SELECT venue_id
    FROM check_ins
    WHERE created_at > ${since}
  `;

  const venueIds = new Set(
    (data as CheckInVenueRow[])
      .map((row) => row.venue_id)
      .filter((venueId): venueId is string => Boolean(venueId))
  );

  return NextResponse.json(
    {
      checkInsTonight: Array.isArray(data) ? data.length : 0,
      venuesActive: venueIds.size,
    },
    { headers }
  );
}
