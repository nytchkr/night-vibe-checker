import { NextResponse, type NextRequest } from "next/server";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { mapConsumerVenue } from "@/lib/consumerVenue";
import { sql } from "@/lib/db";
import { scoreTrendingVenue } from "@/lib/trendingVenueIds";
import type { ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

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
    venue_id, place_id, busyness_0_100, busyness_source,
    confidence_0_1, computed_at, last_busyness_refresh
  )
`;

type ZoneTrendingVenue = {
  id: string;
  name: string;
  score: number;
  busyness: number | null;
  openNow: boolean | null;
};

type ZoneTrendingResponse = {
  zoneId: string;
  venues: ZoneTrendingVenue[];
};

type ZoneTrendingRow = Record<string, unknown>;

function busynessFor(venue: ConsumerVenue): number | null {
  const busyness = venue.signal?.busyness0To100;
  return typeof busyness === "number" && Number.isFinite(busyness) ? busyness : null;
}

function mapTrendingResponse(item: { venue: ConsumerVenue; score: number }): ZoneTrendingVenue {
  return {
    id: item.venue.id,
    name: item.venue.name,
    score: item.score,
    busyness: busynessFor(item.venue),
    openNow: item.venue.openNow ?? null,
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
  let rows: ZoneTrendingRow[];
  try {
    rows = (await sql`
      SELECT
        v.*,
        to_jsonb(vs) AS venue_signals
      FROM venues v
      LEFT JOIN venue_signals vs ON vs.venue_id = v.id
      WHERE v.zone_id = ${zoneId}
        AND COALESCE(v.hidden, false) = false
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
    }))
    .filter((item) => item.venue.openNow !== false);

  const now = new Date();
  const venues = scored
    .map((item) => ({
      ...item,
      score: scoreTrendingVenue(item.venue, now),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.venue.name.localeCompare(b.venue.name);
    })
    .slice(0, TRENDING_LIMIT)
    .map(mapTrendingResponse);

  return NextResponse.json({ zoneId, venues }, { status: 200, headers: CACHE_HEADERS });
}
