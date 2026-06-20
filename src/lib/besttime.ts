import { supabaseAdmin } from "@/lib/supabase";

type VenueRow = {
  id: string;
  place_id: string;
  name: string;
  address: string;
  besttime_venue_id: string | null;
};

export type RefreshResult = { venueId: string; ok: boolean; reason?: string };
type BusynessSource = "live" | "forecast";

function apiKey(): string {
  const key = process.env.BESTTIME_API_KEY;
  if (!key) throw new Error("BESTTIME_API_KEY is not set.");
  return key;
}

// Register venue with BestTime, returns venue_id
async function registerVenue(venue: VenueRow, key: string): Promise<string> {
  const params = new URLSearchParams({
    api_key_private: key,
    venue_name: venue.name,
    venue_address: venue.address,
  });
  const res = await fetch(`https://besttime.app/api/v1/forecasts?${params}`, {
    method: "POST",
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || data.status === "Error") {
    const message = typeof data.message === "string" ? data.message : JSON.stringify(data.message ?? {});
    throw new Error(`BestTime register failed: ${message}`);
  }
  const venueId: string | null = data.venue_info?.venue_id ?? data.venue?.venue_id ?? null;
  if (!venueId) throw new Error("BestTime register: no venue_id in response");
  return venueId;
}

// Fetch live busyness for current hour
async function fetchLiveHour(venueId: string, key: string): Promise<number | null> {
  const params = new URLSearchParams({ venue_id: venueId, api_key_private: key });
  const res = await fetch(`https://besttime.app/api/v1/forecasts/live/hour/now?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`BestTime live HTTP ${res.status}`);
  const data = await res.json();
  const value: unknown = data.analysis?.venue_live_busyness;
  return typeof value === "number" ? value : null;
}

// Fetch forecast busyness for current hour (fallback)
async function fetchForecastHour(venueId: string, key: string): Promise<number | null> {
  const params = new URLSearchParams({ venue_id: venueId, api_key_private: key });
  const res = await fetch(`https://besttime.app/api/v1/forecasts/hour/now?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`BestTime forecast HTTP ${res.status}`);
  const data = await res.json();
  const value: unknown = data.analysis?.hour_analysis?.busyness_score;
  return typeof value === "number" ? value : null;
}

/** Maps a 0-100 busyness score to a discrete label. */
export function busynessLabel(score: number): "dead" | "moderate" | "packed" {
  if (score <= 33) return "dead";
  if (score <= 66) return "moderate";
  return "packed";
}

export function busynessScoreForStorage(score: number): 16 | 50 | 84 {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label = busynessLabel(clamped);
  if (label === "dead") return 16;
  if (label === "moderate") return 50;
  return 84;
}

function charlotteDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  return { weekday, hour };
}

export function fallbackForecastScore(date = new Date()): 16 | 50 | 84 {
  const { weekday, hour } = charlotteDateParts(date);
  const isFridayOrSaturday = weekday === "Fri" || weekday === "Sat";
  const isLateWeekendCarryover = (weekday === "Sat" || weekday === "Sun") && hour < 2;

  if ((isFridayOrSaturday && hour >= 22) || isLateWeekendCarryover) return 84;
  if (isFridayOrSaturday && hour >= 20 && hour < 22) return 50;
  if (["Mon", "Tue", "Wed", "Thu"].includes(weekday ?? "") && hour >= 23) return 16;
  return 50;
}

async function writeBusyness(
  venue: VenueRow,
  bestTimeVenueId: string | null,
  busyness: 16 | 50 | 84,
  source: BusynessSource,
  refreshedAt: string
) {
  const venueUpdate: Partial<Pick<VenueRow, "besttime_venue_id">> & { last_busyness_refresh: string } = {
    last_busyness_refresh: refreshedAt,
  };
  if (bestTimeVenueId) {
    venueUpdate.besttime_venue_id = bestTimeVenueId;
  }

  const { error: venueError } = await supabaseAdmin.from("venues").update(venueUpdate).eq("id", venue.id);
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
}

export async function refreshBusyness(limit = 50): Promise<RefreshResult[]> {
  const { data: venues, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, name, address, besttime_venue_id")
    .eq("hidden", false)
    .order("last_busyness_refresh", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;

  return refreshVenueRows((venues ?? []) as VenueRow[]);
}

export async function refreshBusynessForVenue(venueId: string): Promise<RefreshResult> {
  const { data: venue, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, name, address, besttime_venue_id")
    .eq("id", venueId)
    .single();

  if (error) throw error;

  const [result] = await refreshVenueRows([venue as VenueRow]);
  return result ?? { venueId, ok: false, reason: "Venue refresh did not return a result." };
}

async function refreshVenueRows(venues: VenueRow[]): Promise<RefreshResult[]> {
  const key = apiKey();
  const results: RefreshResult[] = [];

  for (const venue of venues) {
    try {
      let bestTimeVenueId = venue.besttime_venue_id;
      let busynessValue: number | null = null;
      let source: BusynessSource = "forecast";
      let fallbackReason: string | undefined;

      try {
        if (!bestTimeVenueId) {
          bestTimeVenueId = await registerVenue(venue, key);
        }

        try {
          busynessValue = await fetchLiveHour(bestTimeVenueId, key);
        } catch {
          busynessValue = null;
        }
        if (busynessValue !== null) {
          source = "live";
        } else {
          busynessValue = await fetchForecastHour(bestTimeVenueId, key);
          source = "forecast";
        }
      } catch (err) {
        fallbackReason = err instanceof Error ? err.message : "Unknown BestTime error";
      }

      if (busynessValue === null) {
        busynessValue = fallbackForecastScore();
        source = "forecast";
      }

      const refreshedAt = new Date().toISOString();
      const busyness = busynessScoreForStorage(busynessValue);

      await writeBusyness(venue, bestTimeVenueId, busyness, source, refreshedAt);

      results.push({
        venueId: venue.id,
        ok: true,
        reason: fallbackReason ? `Fallback forecast: ${fallbackReason}` : undefined,
      });
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
