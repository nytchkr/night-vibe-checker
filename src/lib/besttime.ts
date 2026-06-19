import { supabaseAdmin } from "@/lib/supabase";

type VenueRow = {
  id: string;
  place_id: string;
  name: string;
  address: string;
  besttime_venue_id: string | null;
};

type BestTimeLiveResponse = {
  venue_info?: { venue_id?: string };
  analysis?: {
    venue_live_busyness?: number;
    venue_forecasted_busyness?: number;
  };
  forecasted?: boolean;
};

function apiKey(): string {
  const key = process.env.BESTTIME_API_KEY;
  if (!key) throw new Error("BESTTIME_API_KEY is not set.");
  return key;
}

function readBusyness(json: BestTimeLiveResponse) {
  const live = json.analysis?.venue_live_busyness;
  if (typeof live === "number") {
    return { value: live, source: "live" as const };
  }

  const forecast = json.analysis?.venue_forecasted_busyness;
  if (typeof forecast === "number") {
    return { value: forecast, source: "forecast" as const };
  }

  return null;
}

async function fetchBestTimeLive(venue: VenueRow) {
  const params = new URLSearchParams({
    api_key_private: apiKey(),
    venue_name: venue.name,
    venue_address: venue.address,
  });
  if (venue.besttime_venue_id) params.set("venue_id", venue.besttime_venue_id);

  const res = await fetch(`https://besttime.app/api/v1/forecasts/live?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`BestTime HTTP ${res.status}`);
  return (await res.json()) as BestTimeLiveResponse;
}

export async function refreshBusyness(limit = 50) {
  const { data: venues, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, name, address, besttime_venue_id")
    .eq("hidden", false)
    .order("last_busyness_refresh", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;

  const results: { venueId: string; ok: boolean; reason?: string }[] = [];
  for (const venue of (venues ?? []) as VenueRow[]) {
    try {
      const json = await fetchBestTimeLive(venue);
      const read = readBusyness(json);
      if (!read) {
        results.push({ venueId: venue.id, ok: false, reason: "No BestTime read" });
        continue;
      }

      const refreshedAt = new Date().toISOString();
      const busyness = Math.max(0, Math.min(100, Math.round(read.value)));
      const besttimeVenueId = json.venue_info?.venue_id ?? venue.besttime_venue_id;

      const { error: venueError } = await supabaseAdmin
        .from("venues")
        .update({
          besttime_venue_id: besttimeVenueId,
          busyness_0_100: busyness,
          busyness_source: read.source,
          last_busyness_refresh: refreshedAt,
        })
        .eq("id", venue.id);
      if (venueError) throw venueError;

      const { error: signalError } = await supabaseAdmin.from("venue_signals").upsert(
        {
          venue_id: venue.id,
          place_id: venue.place_id,
          busyness_0_100: busyness,
          busyness_source: read.source,
          last_busyness_refresh: refreshedAt,
          computed_at: refreshedAt,
        },
        { onConflict: "venue_id" }
      );
      if (signalError) throw signalError;

      results.push({ venueId: venue.id, ok: true });
    } catch (error) {
      results.push({
        venueId: venue.id,
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
