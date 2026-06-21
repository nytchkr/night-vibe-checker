import { supabaseAdmin } from "@/lib/supabase";

export type AdminRecentCheckIn = {
  id: string;
  user_id: string;
  place_id: string;
  created_at: string;
  busyness: string;
  crowd_feel: string;
};

export type AdminMissingBestTimeVenue = {
  place_id: string;
  name: string;
  created_at: string;
};

export type AdminStats = {
  venues: number;
  checkins: number;
  users: number;
  signals_24h: number;
  recent_checkins: AdminRecentCheckIn[];
  missing_besttime: AdminMissingBestTimeVenue[];
};

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

function assertNoError(result: CountResult, label: string) {
  if (result.error) {
    throw new Error(`Failed to fetch ${label}: ${result.error.message}`);
  }
}

async function countAuthUsers(): Promise<number> {
  const pageSize = 1000;
  let page = 1;
  let total = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    const count = data.users.length;
    total += count;

    if (count < pageSize) return total;
    page += 1;
  }
}

export async function getAdminStats(): Promise<AdminStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [venuesResult, checkinsResult, signalsResult, recentResult, missingResult, users] =
    await Promise.all([
      supabaseAdmin.from("venues").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("check_ins").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("venue_signals")
        .select("venue_id", { count: "exact", head: true })
        .gte("computed_at", since24h),
      supabaseAdmin
        .from("check_ins")
        .select("id, user_id, place_id, created_at, busyness, crowd_feel")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("venues")
        .select("place_id, name, created_at")
        .or("besttime_venue_id.is.null,besttime_venue_id.eq.")
        .order("created_at", { ascending: true })
        .limit(50),
      countAuthUsers(),
    ]);

  assertNoError(venuesResult, "venue count");
  assertNoError(checkinsResult, "check-in count");
  assertNoError(signalsResult, "24h signal count");

  if (recentResult.error) {
    throw new Error(`Failed to fetch recent check-ins: ${recentResult.error.message}`);
  }

  if (missingResult.error) {
    throw new Error(`Failed to fetch venues missing BestTime IDs: ${missingResult.error.message}`);
  }

  return {
    venues: venuesResult.count ?? 0,
    checkins: checkinsResult.count ?? 0,
    users,
    signals_24h: signalsResult.count ?? 0,
    recent_checkins: (recentResult.data ?? []).map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id ?? ""),
      place_id: String(row.place_id ?? ""),
      created_at: String(row.created_at ?? ""),
      busyness: String(row.busyness ?? ""),
      crowd_feel: String(row.crowd_feel ?? ""),
    })),
    missing_besttime: (missingResult.data ?? []).map((row) => ({
      place_id: String(row.place_id ?? ""),
      name: String(row.name ?? ""),
      created_at: String(row.created_at ?? ""),
    })),
  };
}
