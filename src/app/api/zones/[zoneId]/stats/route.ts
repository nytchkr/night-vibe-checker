import { NextResponse, type NextRequest } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const RECENT_WINDOW_HOURS = 2;
const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
};
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};
const VALID_ZONE_IDS = new Set<string>(LAUNCH_ZONES.map((zone) => zone.id));

type ZoneStatsResponse = {
  zoneId: string;
  liveCheckInCount: number;
  topVenueId: string | null;
  topVenueName: string | null;
  venueCount: number;
};

type RecentCheckInRow = {
  venue_id: string | null;
  venues?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

function cutoffIso(): string {
  return new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60_000).toISOString();
}

function firstVenue(row: RecentCheckInRow): { id?: string | null; name?: string | null } | null {
  if (Array.isArray(row.venues)) return row.venues[0] ?? null;
  return row.venues ?? null;
}

function findTopVenue(rows: RecentCheckInRow[]): { id: string; name: string | null } | null {
  const counts = new Map<string, { count: number; name: string | null }>();

  for (const row of rows) {
    const venue = firstVenue(row);
    const venueId = venue?.id ?? row.venue_id;
    if (!venueId) continue;

    const current = counts.get(venueId);
    counts.set(venueId, {
      count: (current?.count ?? 0) + 1,
      name: current?.name ?? venue?.name ?? null,
    });
  }

  let top: { id: string; count: number; name: string | null } | null = null;
  for (const [id, value] of counts) {
    if (!top || value.count > top.count) {
      top = { id, count: value.count, name: value.name };
    }
  }

  return top ? { id: top.id, name: top.name } : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ zoneId: string }> },
): Promise<NextResponse<ZoneStatsResponse | { error: string }>> {
  const { zoneId } = await params;

  if (!VALID_ZONE_IDS.has(zoneId)) {
    return NextResponse.json({ error: "Unknown zoneId." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const recentCutoff = cutoffIso();

  const [liveCountRows, topVenueRows, venueCountRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS count
      FROM check_ins ci
      INNER JOIN venues v ON v.id = ci.venue_id
      WHERE ci.hidden = false
        AND v.zone_id = ${zoneId}
        AND COALESCE(v.hidden, false) = false
        AND ci.created_at > ${recentCutoff}
    `,
    sql`
      SELECT ci.venue_id, jsonb_build_object('id', v.id, 'name', v.name) AS venues
      FROM check_ins ci
      INNER JOIN venues v ON v.id = ci.venue_id
      WHERE ci.hidden = false
        AND v.zone_id = ${zoneId}
        AND COALESCE(v.hidden, false) = false
        AND ci.created_at > ${recentCutoff}
      LIMIT 500
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM venues
      WHERE zone_id = ${zoneId}
        AND COALESCE(hidden, false) = false
    `,
  ]) as [Array<{ count: number }>, RecentCheckInRow[], Array<{ count: number }>];

  const topVenue = findTopVenue(topVenueRows);

  return NextResponse.json(
    {
      zoneId,
      liveCheckInCount: liveCountRows[0]?.count ?? 0,
      topVenueId: topVenue?.id ?? null,
      topVenueName: topVenue?.name ?? null,
      venueCount: venueCountRows[0]?.count ?? 0,
    },
    { status: 200, headers: CACHE_HEADERS },
  );
}
