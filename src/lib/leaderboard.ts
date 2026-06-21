import { supabaseAdmin } from "@/lib/supabase";

const LEADERBOARD_LIMIT = 10;
const LEADERBOARD_WINDOW_DAYS = 7;
const CHECK_IN_FETCH_LIMIT = 1000;

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  checkInCount: number;
  topVenue: string | null;
}

type CheckInLeaderboardRow = {
  user_id: string | null;
  venue_id: string | null;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type UserAggregate = {
  userId: string;
  checkInCount: number;
  venueCounts: Map<string, { name: string; count: number }>;
};

function readVenueName(row: CheckInLeaderboardRow): string {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  return venue?.name?.trim() || row.venue_id || "Unknown venue";
}

function displayNameFromUserId(userId: string): string {
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

function topVenueForAggregate(aggregate: UserAggregate): string | null {
  const topVenue = Array.from(aggregate.venueCounts.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  )[0];
  return topVenue?.name ?? null;
}

export async function getMostActiveLeaderboard(): Promise<LeaderboardEntry[]> {
  const cutoff = new Date(Date.now() - LEADERBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("user_id, venue_id, venues(name)")
    .eq("hidden", false)
    .not("user_id", "is", null)
    .gte("created_at", cutoff)
    .limit(CHECK_IN_FETCH_LIMIT);

  if (error) throw error;

  const aggregates = new Map<string, UserAggregate>();
  for (const row of (data ?? []) as CheckInLeaderboardRow[]) {
    if (!row.user_id) continue;

    const aggregate = aggregates.get(row.user_id) ?? {
      userId: row.user_id,
      checkInCount: 0,
      venueCounts: new Map<string, { name: string; count: number }>(),
    };
    aggregate.checkInCount += 1;

    const venueKey = row.venue_id ?? readVenueName(row);
    const venue = aggregate.venueCounts.get(venueKey) ?? { name: readVenueName(row), count: 0 };
    venue.count += 1;
    aggregate.venueCounts.set(venueKey, venue);
    aggregates.set(row.user_id, aggregate);
  }

  const rankedAggregates = Array.from(aggregates.values())
    .sort((a, b) => b.checkInCount - a.checkInCount || a.userId.localeCompare(b.userId))
    .slice(0, LEADERBOARD_LIMIT);

  const profiles = await loadProfiles(rankedAggregates.map((entry) => entry.userId));

  return rankedAggregates.map((aggregate, index) => {
    const profile = profiles.get(aggregate.userId);
    const displayName = profile?.display_name?.trim() || displayNameFromUserId(aggregate.userId);

    return {
      rank: index + 1,
      userId: aggregate.userId,
      displayName,
      avatarUrl: profile?.avatar_url?.trim() || null,
      checkInCount: aggregate.checkInCount,
      topVenue: topVenueForAggregate(aggregate),
    };
  });
}
