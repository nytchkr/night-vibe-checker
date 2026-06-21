import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const ACTIVITY_FEED_LIMIT = 20;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60",
};

type CheckInFeedRow = {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  created_at: string;
  venues?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
};

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type ActivityFeedItem = {
  id: string;
  user: {
    name: string;
    avatar_url: string | null;
  };
  venue: {
    id: string | null;
    name: string;
  };
  checked_in_at: string;
};

function readVenue(row: CheckInFeedRow): ActivityFeedItem["venue"] {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  return {
    id: venue?.id ?? row.venue_id,
    name: venue?.name?.trim() || "a venue",
  };
}

function fallbackName(userId: string): string {
  return `Explorer ${userId.slice(0, 6)}`;
}

function mapProfiles(rows: ProfileRow[] | null | undefined): Map<string, ProfileRow> {
  const profiles = new Map<string, ProfileRow>();
  for (const row of rows ?? []) {
    const key = row.user_id ?? row.id;
    if (key) profiles.set(key, row);
  }
  return profiles;
}

async function loadProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  if (userIds.length === 0) return new Map();

  const byId = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  if (!byId.error && byId.data && byId.data.length > 0) {
    return mapProfiles(byId.data as ProfileRow[] | null);
  }

  const byUserId = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", userIds);

  if (byUserId.error) return new Map();
  return mapProfiles(byUserId.data as ProfileRow[] | null);
}

export async function GET(): Promise<NextResponse> {
  try {
    const { data, error } = await supabaseAdmin
      .from("check_ins")
      .select("id, user_id, venue_id, created_at, venues(id, name)")
      .eq("hidden", false)
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_FEED_LIMIT);

    if (error) throw error;

    const rows = ((data ?? []) as CheckInFeedRow[]).filter((row) => row.user_id);
    const userIds = Array.from(new Set(rows.map((row) => row.user_id as string)));
    const profiles = await loadProfiles(userIds);

    const items: ActivityFeedItem[] = rows.map((row) => {
      const userId = row.user_id as string;
      const profile = profiles.get(userId);

      return {
        id: row.id,
        user: {
          name: profile?.display_name?.trim() || fallbackName(userId),
          avatar_url: profile?.avatar_url?.trim() || null,
        },
        venue: readVenue(row),
        checked_in_at: row.created_at,
      };
    });

    return NextResponse.json({ items }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error("[activity/feed GET] DB error:", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not load activity feed." } },
      { status: 500, headers: PUBLIC_CACHE_HEADERS }
    );
  }
}
