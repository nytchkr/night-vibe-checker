import { NextResponse, type NextRequest } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { supabaseAdmin } from "@/lib/supabase";

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

  const liveCountQuery = supabaseAdmin
    .from("check_ins")
    .select("id, venues!inner(zone_id, hidden)", { count: "exact", head: true })
    .eq("hidden", false)
    .eq("venues.zone_id", zoneId)
    .eq("venues.hidden", false)
    .gt("created_at", recentCutoff);

  const topVenueQuery = supabaseAdmin
    .from("check_ins")
    .select("venue_id, venues!inner(id, name, zone_id, hidden)")
    .eq("hidden", false)
    .eq("venues.zone_id", zoneId)
    .eq("venues.hidden", false)
    .gt("created_at", recentCutoff)
    .limit(500);

  const venueCountQuery = supabaseAdmin
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("zone_id", zoneId)
    .eq("hidden", false);

  const [liveCountResult, topVenueResult, venueCountResult] = await Promise.all([
    liveCountQuery,
    topVenueQuery,
    venueCountQuery,
  ]);

  if (liveCountResult.error || topVenueResult.error || venueCountResult.error) {
    console.error("[zone-stats GET] DB error:", {
      liveCountError: liveCountResult.error,
      topVenueError: topVenueResult.error,
      venueCountError: venueCountResult.error,
    });
    return NextResponse.json(
      { error: "Could not load zone stats." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const topVenue = findTopVenue((topVenueResult.data ?? []) as RecentCheckInRow[]);

  return NextResponse.json(
    {
      zoneId,
      liveCheckInCount: liveCountResult.count ?? 0,
      topVenueId: topVenue?.id ?? null,
      topVenueName: topVenue?.name ?? null,
      venueCount: venueCountResult.count ?? 0,
    },
    { status: 200, headers: CACHE_HEADERS },
  );
}
