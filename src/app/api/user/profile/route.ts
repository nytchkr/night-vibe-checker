import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { calculateUserStreak } from "@/app/api/user/streak/route";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type VenueRelation = {
  name?: string | null;
};

type CheckInVenueRow = {
  venue_id: string | null;
  venues?: VenueRelation | VenueRelation[] | null;
};

type CheckInStreakRow = {
  created_at: string | null;
};

type TopVenue = {
  venueId: string;
  venueName: string | null;
  checkInCount: number;
};

type UserProfileResponse = {
  userId: string;
  totalCheckIns: number;
  uniqueVenues: number;
  streak: number;
  topVenues: TopVenue[];
};

type UserProfileErrorResponse = {
  error: string;
};

export async function GET(
  req: NextRequest,
): Promise<NextResponse<UserProfileResponse | UserProfileErrorResponse>> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const [totalRows, streakResult, venueResult] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS count
      FROM check_ins
      WHERE user_id = ${userId}
        AND hidden = false
    `,
    sql`
      SELECT created_at
      FROM check_ins
      WHERE user_id = ${userId}
        AND hidden = false
      ORDER BY created_at DESC
    `,
    sql`
      SELECT ci.venue_id, jsonb_build_object('name', v.name) AS venues
      FROM check_ins ci
      LEFT JOIN venues v ON v.id = ci.venue_id
      WHERE ci.user_id = ${userId}
        AND ci.hidden = false
    `,
  ]) as [Array<{ count: number }>, CheckInStreakRow[], CheckInVenueRow[]];

  const venueRows = venueResult;
  const streakRows = streakResult;
  const { topVenues, uniqueVenues } = summarizeVenues(venueRows);

  return NextResponse.json(
    {
      userId,
      totalCheckIns: totalRows[0]?.count ?? streakRows.length,
      uniqueVenues,
      streak: calculateUserStreak(streakRows).streak,
      topVenues,
    },
    { headers: NO_STORE_HEADERS },
  );
}

function summarizeVenues(rows: CheckInVenueRow[]): { topVenues: TopVenue[]; uniqueVenues: number } {
  const venueCounts = new Map<string, { venueName: string | null; checkInCount: number }>();

  for (const row of rows) {
    if (!row.venue_id) continue;

    const existing = venueCounts.get(row.venue_id);
    venueCounts.set(row.venue_id, {
      venueName: existing?.venueName ?? venueFrom(row)?.name ?? null,
      checkInCount: (existing?.checkInCount ?? 0) + 1,
    });
  }

  return {
    uniqueVenues: venueCounts.size,
    topVenues: [...venueCounts.entries()]
      .map(([venueId, venue]) => ({ venueId, ...venue }))
      .sort((a, b) => b.checkInCount - a.checkInCount || compareNullableNames(a.venueName, b.venueName))
      .slice(0, 3),
  };
}

function venueFrom(row: CheckInVenueRow): VenueRelation | null {
  const relation = row.venues;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function compareNullableNames(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}
