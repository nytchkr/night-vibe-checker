import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { supabaseAdmin } from "@/lib/supabase";

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

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, busyness, crowd_feel, created_at")
    .not("venue_id", "is", null)
    .eq("hidden", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    console.error("[activity/feed GET] DB error:", error);
    return NextResponse.json(
      { error: "Could not fetch activity feed." },
      { status: 500, headers }
    );
  }

  const rawRows = (data ?? []) as CheckInFeedRow[];
  const validRows = rawRows.filter(
    (row) => row.id && row.venue_id && row.created_at && row.busyness && row.crowd_feel
  );

  const venueIds = Array.from(new Set(validRows.map((r) => r.venue_id as string)));
  const { data: venueData } = venueIds.length
    ? await supabaseAdmin.from("venues").select("id, name, hidden").in("id", venueIds)
    : { data: [] };
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
