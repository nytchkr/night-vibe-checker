import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 60;

const ACTIVITY_LIMIT = 20;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

export type ActivityFeedItem = {
  id: string;
  user: {
    name: string;
    avatar_url: string | null;
  };
  venue: {
    id: string;
    name: string;
  };
  checked_in_at: string;
};

type CheckInFeedRow = {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  created_at: string;
  venues?: { id?: string | null; name?: string | null; hidden?: boolean | null } | { id?: string | null; name?: string | null; hidden?: boolean | null }[] | null;
};

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_private?: boolean | null;
  private?: boolean | null;
  visibility?: string | null;
  profile_visibility?: string | null;
};

type ProfileSelectAttempt = {
  key: "id" | "user_id";
  columns: string;
  privacyColumn?: keyof Pick<ProfileRow, "is_private" | "private" | "visibility" | "profile_visibility">;
};

const PROFILE_SELECT_ATTEMPTS: ProfileSelectAttempt[] = [
  { key: "id", columns: "id, display_name, avatar_url, is_private", privacyColumn: "is_private" },
  { key: "user_id", columns: "user_id, display_name, avatar_url, is_private", privacyColumn: "is_private" },
  { key: "id", columns: "id, display_name, avatar_url, private", privacyColumn: "private" },
  { key: "user_id", columns: "user_id, display_name, avatar_url, private", privacyColumn: "private" },
  { key: "id", columns: "id, display_name, avatar_url, visibility", privacyColumn: "visibility" },
  { key: "user_id", columns: "user_id, display_name, avatar_url, visibility", privacyColumn: "visibility" },
  { key: "id", columns: "id, display_name, avatar_url, profile_visibility", privacyColumn: "profile_visibility" },
  { key: "user_id", columns: "user_id, display_name, avatar_url, profile_visibility", privacyColumn: "profile_visibility" },
  { key: "id", columns: "id, display_name, avatar_url" },
  { key: "user_id", columns: "user_id, display_name, avatar_url" },
];

function readVenue(row: CheckInFeedRow): { id: string; name: string; hidden: boolean } | null {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  const id = venue?.id?.trim() || row.venue_id?.trim();
  const name = venue?.name?.trim();
  if (!id || !name) return null;
  return { id, name, hidden: Boolean(venue?.hidden) };
}

function fallbackName(userId: string): string {
  return `Explorer ${userId.slice(0, 6)}`;
}

function isPublicProfile(row: ProfileRow, privacyColumn?: ProfileSelectAttempt["privacyColumn"]): boolean {
  if (!privacyColumn) return true;
  const value = row[privacyColumn];
  if (typeof value === "boolean") return !value;
  if (typeof value === "string") return !["private", "hidden"].includes(value.toLowerCase());
  return true;
}

async function loadPublicProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  if (userIds.length === 0) return new Map();

  for (const attempt of PROFILE_SELECT_ATTEMPTS) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(attempt.columns)
      .in(attempt.key, userIds);

    if (error) continue;

    const rows = (data ?? []) as ProfileRow[];
    if (rows.length === 0) continue;

    const profiles = new Map<string, ProfileRow>();
    for (const row of rows) {
      if (!isPublicProfile(row, attempt.privacyColumn)) continue;
      const key = attempt.key === "id" ? row.id : row.user_id;
      if (key) profiles.set(key, row);
    }
    return profiles;
  }

  return new Map();
}

export async function GET(): Promise<NextResponse<{ items: ActivityFeedItem[] } | { error: string }>> {
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, user_id, venue_id, created_at, venues(id, name, hidden)")
    .eq("hidden", false)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    console.error("[activity/feed GET] DB error:", error);
    return NextResponse.json(
      { error: "Could not fetch activity feed." },
      { status: 500, headers: PUBLIC_CACHE_HEADERS }
    );
  }

  const rows = ((data ?? []) as CheckInFeedRow[]).filter((row) => row.id && row.user_id && readVenue(row));
  const userIds = Array.from(new Set(rows.map((row) => row.user_id as string)));
  const profiles = await loadPublicProfiles(userIds);

  const items = rows.flatMap((row): ActivityFeedItem[] => {
    const userId = row.user_id as string;
    const profile = profiles.get(userId);
    if (!profile) return [];

    const venue = readVenue(row);
    if (!venue || venue.hidden) return [];

    return [{
      id: row.id,
      user: {
        name: profile.display_name?.trim() || fallbackName(userId),
        avatar_url: profile.avatar_url?.trim() || null,
      },
      venue: {
        id: venue.id,
        name: venue.name,
      },
      checked_in_at: row.created_at,
    }];
  });

  return NextResponse.json({ items }, { headers: PUBLIC_CACHE_HEADERS });
}
