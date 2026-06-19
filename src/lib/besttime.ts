import { supabaseAdmin } from "@/lib/supabase";

type VenueRow = {
  id: string;
  place_id: string;
  name: string;
  address: string;
  besttime_venue_id: string | null;
};

export type RefreshResult = { venueId: string; ok: boolean; reason?: string };

function apiKey(): string {
  const key = process.env.BESTTIME_API_KEY;
  if (!key) throw new Error("BESTTIME_API_KEY is not set.");
  return key;
}

// Register venue with BestTime, returns venue_id
async function registerVenue(venue: VenueRow, key: string): Promise<string> {
  const res = await fetch("https://besttime.app/api/v1/forecasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key_private: key,
      venue_name: venue.name,
      venue_address: venue.address,
    }),
  });
  if (!res.ok) throw new Error(`BestTime register HTTP ${res.status}`);
  const data = await res.json();
  const venueId: string | null = data.venue?.venue_id ?? null;
  if (!venueId) throw new Error("BestTime register: no venue_id in response");
  return venueId;
}

// Fetch live busyness for current hour
async function fetchLiveHour(venueId: string, key: string): Promise<number | null> {
  const res = await fetch(
    `https://besttime.app/api/v1/forecasts/live/hour/now?venue_id=${venueId}&api_key_private=${key}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`BestTime live HTTP ${res.status}`);
  const data = await res.json();
  const value: number | undefined = data.analysis?.venue_live_busyness;
  return typeof value === "number" ? value : null;
}

// Fetch forecast busyness for current hour (fallback)
async function fetchForecastHour(venueId: string, key: string): Promise<number | null> {
  const res = await fetch(
    `https://besttime.app/api/v1/forecasts/hour/now?venue_id=${venueId}&api_key_private=${key}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`BestTime forecast HTTP ${res.status}`);
  const data = await res.json();
  const value: number | undefined = data.analysis?.hour_analysis?.busyness_score;
  return typeof value === "number" ? value : null;
}

/** Maps a 0-100 busyness score to a discrete label. */
export function busynessLabel(score: number): "dead" | "moderate" | "packed" {
  if (score < 33) return "dead";
  if (score < 67) return "moderate";
  return "packed";
}

export async function refreshBusyness(limit = 50): Promise<RefreshResult[]> {
  const { data: venues, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, name, address, besttime_venue_id")
    .eq("hidden", false)
    .order("last_busyness_refresh", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;

  const key = apiKey();
  const results: RefreshResult[] = [];

  for (const venue of (venues ?? []) as VenueRow[]) {
    try {
      // Register if we don't have a besttime_venue_id yet
      let bestTimeVenueId = venue.besttime_venue_id;
      if (!bestTimeVenueId) {
        bestTimeVenueId = await registerVenue(venue, key);
      }

      // Try live first, fall back to forecast
      let busynessValue: number | null = await fetchLiveHour(bestTimeVenueId, key);
      let source: "live" | "forecast";

      if (busynessValue !== null) {
        source = "live";
      } else {
        busynessValue = await fetchForecastHour(bestTimeVenueId, key);
        source = "forecast";
      }

      if (busynessValue === null) {
        results.push({ venueId: venue.id, ok: false, reason: "No BestTime read" });
        continue;
      }

      const refreshedAt = new Date().toISOString();
      const busyness = Math.max(0, Math.min(100, Math.round(busynessValue)));

      const { error: venueError } = await supabaseAdmin
        .from("venues")
        .update({
          besttime_venue_id: bestTimeVenueId,
          busyness_0_100: busyness,
          busyness_source: source,
          last_busyness_refresh: refreshedAt,
        })
        .eq("id", venue.id);
      if (venueError) throw venueError;

      const { error: signalError } = await supabaseAdmin.from("venue_signals").upsert(
        {
          venue_id: venue.id,
          place_id: venue.place_id,
          busyness_0_100: busyness,
          busyness_source: source,
          last_busyness_refresh: refreshedAt,
          computed_at: refreshedAt,
        },
        { onConflict: "venue_id" }
      );
      if (signalError) throw signalError;

      results.push({ venueId: venue.id, ok: true });
    } catch (err) {
      results.push({
        venueId: venue.id,
        ok: false,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}
