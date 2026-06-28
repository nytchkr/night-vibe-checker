import { NextResponse, type NextRequest } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { mapConsumerVenue } from "@/lib/consumerVenue";
import { sql } from "@/lib/db";
import { scoreTrendingVenue } from "@/lib/trendingVenueIds";
import type { ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

const RECENT_WINDOW_HOURS = 2;
const TRENDING_LIMIT = 5;
const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
};
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};
const VALID_ZONE_IDS = new Set<string>(LAUNCH_ZONES.map((zone) => zone.id));

const ZONE_TRENDING_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id, hidden,
  updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source, mf_ratio,
    confidence_0_1, sample_size, computed_at, last_busyness_refresh
  ),
  check_ins (
    venue_id, created_at, hidden
  )
`;

type ZoneTrendingVenue = {
  id: string;
  name: string;
  score: number;
  busyness: number | null;
  openNow: boolean | null;
  checkInsLast2h: number;
};

type ZoneTrendingResponse = {
  zoneId: string;
  venues: ZoneTrendingVenue[];
};

type ZoneTrendingRow = Record<string, unknown> & {
  check_ins?: unknown;
};

function cutoffIso(): string {
  return new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60_000).toISOString();
}

function isVisibleCheckIn(row: unknown): row is { created_at: string; hidden?: boolean | null } {
  if (!row || typeof row !== "object") return false;
  const checkIn = row as { created_at?: unknown; hidden?: unknown };
  return typeof checkIn.created_at === "string" && checkIn.hidden !== true;
}

function countCheckInsLast2h(row: ZoneTrendingRow): number {
  if (!Array.isArray(row.check_ins)) return 0;
  return row.check_ins.filter(isVisibleCheckIn).length;
}

function busynessFor(venue: ConsumerVenue): number | null {
  const busyness = venue.signal?.busyness0To100;
  return typeof busyness === "number" && Number.isFinite(busyness) ? busyness : null;
}

function mapTrendingResponse(item: { venue: ConsumerVenue; score: number; checkInsLast2h: number }): ZoneTrendingVenue {
  return {
    id: item.venue.id,
    name: item.venue.name,
    score: item.score,
    busyness: busynessFor(item.venue),
    openNow: item.venue.openNow ?? null,
    checkInsLast2h: item.checkInsLast2h,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ zoneId: string }> },
): Promise<NextResponse<ZoneTrendingResponse | { error: string }>> {
  const { zoneId } = await params;

  if (!VALID_ZONE_IDS.has(zoneId)) {
    return NextResponse.json({ error: "Unknown zoneId." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  void ZONE_TRENDING_SELECT;
  const recentCutoff = cutoffIso();
  let rows: ZoneTrendingRow[];
  try {
    rows = (await sql`
      SELECT
        v.*,
        to_jsonb(vs) AS venue_signals,
        COALESCE(
          jsonb_agg(
            jsonb_build_object('venue_id', ci.venue_id, 'created_at', ci.created_at, 'hidden', ci.hidden)
          ) FILTER (WHERE ci.id IS NOT NULL),
          '[]'::jsonb
        ) AS check_ins
      FROM venues v
      LEFT JOIN venue_signals vs ON vs.venue_id = v.id
      LEFT JOIN check_ins ci
        ON ci.venue_id = v.id
        AND ci.created_at >= ${recentCutoff}
        AND ci.hidden = false
      WHERE v.zone_id = ${zoneId}
        AND COALESCE(v.hidden, false) = false
      GROUP BY v.id, vs.venue_id
      ORDER BY v.name ASC
    `) as ZoneTrendingRow[];
  } catch {
    return NextResponse.json({ error: "Could not load zone trending venues." }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const scored = rows
    .filter((row) => row.hidden !== true)
    .filter((row) => row.open_now !== false)
    .map((row) => ({
      venue: mapConsumerVenue(row),
      checkInsLast2h: countCheckInsLast2h(row),
    }))
    .filter((item) => item.venue.openNow !== false);

  const maxCheckIns = scored.reduce((max, item) => Math.max(max, item.checkInsLast2h), 0);
  const now = new Date();
  const venues = scored
    .map((item) => ({
      ...item,
      score: scoreTrendingVenue(item.venue, item.checkInsLast2h, maxCheckIns, now),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.checkInsLast2h !== a.checkInsLast2h) return b.checkInsLast2h - a.checkInsLast2h;
      return a.venue.name.localeCompare(b.venue.name);
    })
    .slice(0, TRENDING_LIMIT)
    .map(mapTrendingResponse);

  return NextResponse.json({ zoneId, venues }, { status: 200, headers: CACHE_HEADERS });
}
