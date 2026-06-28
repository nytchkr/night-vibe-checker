import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVITY_LIMIT = 10;
const RECENT_ACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;
const DYNAMIC_HEADERS = {
  "Cache-Control": "private, no-store",
};

export type ActivityFeedItem = {
  id: string;
  venue: {
    id: string;
    name: string;
  };
  busyness: "dead" | "moderate" | "packed";
  crowd_feel: string;
  checked_in_at: string;
};

type CheckInFeedRow = {
  id: string;
  venue_id: string | null;
  busyness: "dead" | "moderate" | "packed" | null;
  crowd_feel: string | null;
  created_at: string;
};

export async function GET(req: NextRequest): Promise<NextResponse<{ items: ActivityFeedItem[] } | { error: string }>> {
  const rate = await publicRateLimit(req, "activity-feed", 60);
  if (rate.response) return rate.response as NextResponse<{ items: ActivityFeedItem[] } | { error: string }>;
  const headers = { ...DYNAMIC_HEADERS, ...rate.headers };
  const since = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MS).toISOString();

  const data = await sql`
    SELECT id, venue_id, busyness, crowd_feel, created_at
    FROM check_ins
    WHERE venue_id IS NOT NULL
      AND hidden = false
      AND created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${ACTIVITY_LIMIT}
  `;

  const rawRows = data as CheckInFeedRow[];
  const validRows = rawRows.filter(
    (row) => row.id && row.venue_id && row.created_at && row.busyness && row.crowd_feel
  );

  const venueIds = Array.from(new Set(validRows.map((r) => r.venue_id as string)));
  const venueData = venueIds.length
    ? await sql`
        SELECT id, name, hidden
        FROM venues
        WHERE id = ANY(${venueIds}::uuid[])
      `
    : [];
  const venueMap = new Map<string, { name: string; hidden: boolean }>(
    ((venueData ?? []) as { id: string; name: string; hidden?: boolean | null }[]).map((v) => [
      v.id,
      { name: v.name, hidden: Boolean(v.hidden) },
    ])
  );

  const items = validRows.flatMap((row): ActivityFeedItem[] => {
    const venueId = row.venue_id as string;
    const venue = venueMap.get(venueId);
    if (!venue || venue.hidden) return [];

    return [{
      id: row.id,
      venue: {
        id: venueId,
        name: venue.name,
      },
      busyness: row.busyness as ActivityFeedItem["busyness"],
      crowd_feel: row.crowd_feel as string,
      checked_in_at: row.created_at,
    }];
  });

  return NextResponse.json({ items }, { headers });
}
