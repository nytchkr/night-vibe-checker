import { supabaseAdmin } from "@/lib/supabase";

export type AdminMissingBestTimeVenue = {
  id: string;
  place_id: string;
  name: string;
};

export type AdminStaleSignalVenue = {
  venue_id: string;
  venue_name: string;
  last_busyness_refresh: string | null;
  hours_since_refresh: number | null;
};

export type AdminStats = {
  venues_total: number;
  checkins_24h: number;
  checkins_7d: number;
  checkins_all_time: number;
  missing_besttime: AdminMissingBestTimeVenue[];
  stale_signals: AdminStaleSignalVenue[];
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

function getVenueName(row: { venues?: unknown }): string {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  if (typeof venue === "object" && venue !== null && "name" in venue) {
    return String((venue as { name?: unknown }).name ?? "Unknown venue");
  }
  return "Unknown venue";
}

function hoursSince(value: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.round(((Date.now() - timestamp) / (60 * 60 * 1000)) * 10) / 10);
}

export async function getAdminStats(): Promise<AdminStats> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [venuesResult, checkins24hResult, checkins7dResult, checkinsAllTimeResult, missingResult, staleSignalsResult] =
    await Promise.all([
      supabaseAdmin.from("venues").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
      supabaseAdmin
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7d),
      supabaseAdmin.from("check_ins").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("venues")
        .select("id, place_id, name")
        .or("besttime_venue_id.is.null,besttime_venue_id.eq.")
        .order("name", { ascending: true })
        .limit(50),
      supabaseAdmin
        .from("venue_signals")
        .select("venue_id, last_busyness_refresh, venues(name)")
        .order("last_busyness_refresh", { ascending: true, nullsFirst: true })
        .limit(10),
    ]);

  assertNoError(venuesResult, "venue count");
  assertNoError(checkins24hResult, "24h check-in count");
  assertNoError(checkins7dResult, "7d check-in count");
  assertNoError(checkinsAllTimeResult, "all-time check-in count");

  if (missingResult.error) {
    throw new Error(`Failed to fetch venues missing BestTime IDs: ${missingResult.error.message}`);
  }

  if (staleSignalsResult.error) {
    throw new Error(`Failed to fetch signal staleness: ${staleSignalsResult.error.message}`);
  }

  return {
    venues_total: venuesResult.count ?? 0,
    checkins_24h: checkins24hResult.count ?? 0,
    checkins_7d: checkins7dResult.count ?? 0,
    checkins_all_time: checkinsAllTimeResult.count ?? 0,
    missing_besttime: (missingResult.data ?? []).map((row) => ({
      id: String(row.id ?? ""),
      place_id: String(row.place_id ?? ""),
      name: String(row.name ?? ""),
    })),
    stale_signals: (staleSignalsResult.data ?? []).map((row) => {
      const lastRefresh = row.last_busyness_refresh ? String(row.last_busyness_refresh) : null;

      return {
        venue_id: String(row.venue_id ?? ""),
        venue_name: getVenueName(row),
        last_busyness_refresh: lastRefresh,
        hours_since_refresh: hoursSince(lastRefresh),
      };
    }),
  };
}
