import { supabaseAdmin } from "@/lib/supabase";

type VenueRow = {
  id: string;
  place_id: string;
  name: string;
  address: string;
  besttime_venue_id: string | null;
};

export type RefreshResult = { venueId: string; ok: boolean; reason?: string };
export type BestTimeHourlyForecast = {
  hour: number;
  busyness: number;
};
export type BestTimeDayForecast = {
  venueId: string;
  dayInt: number | null;
  updatedOn: string | null;
  hours: BestTimeHourlyForecast[];
};
type BusynessSource = "live" | "forecast";
type BestTimeRegistration = { venueId: string; currentForecast: number | null };
const NO_BESTTIME_FORECAST_REASON = "No BestTime forecast available";

function apiKey(): string {
  const key = process.env.BESTTIME_API_KEY;
  if (!key) throw new Error("BESTTIME_API_KEY is not set.");
  return key;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampForecastScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function currentLocalDayAndHour(timeZone: string): { dayInt: number; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const dayInt = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday ?? "");
    if (dayInt === -1 || !Number.isFinite(hour)) return null;
    return { dayInt, hour };
  } catch {
    return null;
  }
}

function currentForecastFromRegistration(data: unknown): number | null {
  const payload = readObject(data);
  const timeZone = readObject(payload?.venue_info)?.venue_timezone;
  if (typeof timeZone !== "string") return null;

  const current = currentLocalDayAndHour(timeZone);
  const analysis = Array.isArray(payload?.analysis) ? payload.analysis : null;
  const dayAnalysis = readObject(analysis?.[current?.dayInt ?? -1]);
  if (!current || !dayAnalysis) return null;

  const hourAnalysis = Array.isArray(dayAnalysis.hour_analysis) ? dayAnalysis.hour_analysis : [];
  const hourIndex = hourAnalysis.findIndex((hour) => readNumber(readObject(hour)?.hour) === current.hour);
  const dayRaw = Array.isArray(dayAnalysis.day_raw) ? dayAnalysis.day_raw : [];
  return hourIndex >= 0 ? readNumber(dayRaw[hourIndex]) : null;
}

/*
One-time seed note for South End venues missing besttime_venue_id:
do not run from client code, and do not expose BESTTIME_API_KEY.

await fetch("https://besttime.app/api/v1/forecasts?" + new URLSearchParams({
  api_key_private: process.env.BESTTIME_API_KEY!,
  venue_name: venue.name,
  venue_address: venue.address,
}), { method: "POST", cache: "no-store" });

Save response.venue_info.venue_id to venues.besttime_venue_id, then let the
protected refresh-busyness cron cache live/forecast values in venue_signals.
*/

// Register venue with BestTime, returns venue_id and the current-hour forecast when present.
async function registerVenue(venue: VenueRow, key: string): Promise<BestTimeRegistration> {
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
  return { venueId, currentForecast: currentForecastFromRegistration(data) };
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

export function busynessScoreForStorage(score: number): number {
  return clampForecastScore(score);
}

export function isBestTimeForecastUnavailable(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not forecast") ||
    normalized.includes("not enough volume") ||
    normalized.includes("not enough visitor volume") ||
    normalized.includes("too new")
  );
}

async function writeBusyness(
  venue: VenueRow,
  bestTimeVenueId: string | null,
  busyness: number,
  source: BusynessSource,
  refreshedAt: string
) {
  // Data flow: BestTime forecast/live reads are cached in VenueSignal, and
  // client-facing venue APIs only serve that cached signal row.
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

async function writeUnavailableBusyness(venue: VenueRow, refreshedAt: string) {
  const { error: venueError } = await supabaseAdmin
    .from("venues")
    .update({
      besttime_venue_id: null,
      last_busyness_refresh: refreshedAt,
    })
    .eq("id", venue.id);
  if (venueError) throw venueError;

  const { error: signalError } = await supabaseAdmin.from("venue_signals").upsert(
    {
      venue_id: venue.id,
      place_id: venue.place_id,
      busyness_0_100: null,
      busyness_source: null,
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

export async function fetchBestTimeDayRawForecast(besttimeVenueId: string): Promise<BestTimeDayForecast> {
  const venueId = besttimeVenueId.trim();
  if (!venueId) throw new Error("BestTime venue id is required.");

  const params = new URLSearchParams({
    api_key_public: apiKey(),
    venue_id: venueId,
  });
  const res = await fetch(`https://besttime.app/api/v1/forecasts/day/raw?${params}`, {
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  const payload = readObject(data);
  if (!res.ok || payload?.status === "Error") {
    const message = typeof payload?.message === "string" ? payload.message : `BestTime day forecast HTTP ${res.status}`;
    throw new Error(message);
  }

  const analysis = readObject(payload?.analysis);
  const dayRaw = Array.isArray(analysis?.day_raw) ? analysis.day_raw : [];
  const hours = dayRaw
    .map((value, index) => {
      const busyness = readNumber(value);
      if (busyness == null) return null;
      return { hour: index, busyness: clampForecastScore(busyness) };
    })
    .filter((item): item is BestTimeHourlyForecast => item !== null);

  return {
    venueId,
    dayInt: readNumber(payload?.day_int),
    updatedOn: typeof payload?.forecast_updated_on === "string" ? payload.forecast_updated_on : null,
    hours,
  };
}

async function refreshVenueRows(venues: VenueRow[]): Promise<RefreshResult[]> {
  const key = apiKey();
  const results: RefreshResult[] = [];

  for (const venue of venues) {
    try {
      let bestTimeVenueId = venue.besttime_venue_id;
      let needsRegister = !bestTimeVenueId;
      let busynessValue: number | null = null;
      let registeredForecast: number | null = null;
      let source: BusynessSource = "forecast";
      let fallbackReason: string | undefined;

      try {
        for (let attempt = 0; attempt <= 1; attempt++) {
          if (needsRegister) {
            const registration = await registerVenue(venue, key);
            bestTimeVenueId = registration.venueId;
            registeredForecast = registration.currentForecast;
            needsRegister = false;
          }

          try {
            busynessValue = await fetchLiveHour(bestTimeVenueId!, key);
          } catch {
            busynessValue = null;
          }
          if (busynessValue !== null) {
            source = "live";
            break;
          }

          try {
            busynessValue = await fetchForecastHour(bestTimeVenueId!, key);
            source = "forecast";
            break;
          } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (message.includes("HTTP 404") && attempt === 0) {
              needsRegister = true;
              bestTimeVenueId = null;
              registeredForecast = null;
              const { error } = await supabaseAdmin
                .from("venues")
                .update({ besttime_venue_id: null })
                .eq("id", venue.id);
              if (error) throw error;
              fallbackReason = "Stale BestTime ID cleared; re-registering";
            } else {
              if (registeredForecast !== null) {
                busynessValue = registeredForecast;
                source = "forecast";
                fallbackReason = fallbackReason ?? "Using current forecast from new BestTime registration";
                break;
              }
              throw err;
            }
          }
        }
      } catch (err) {
        fallbackReason = err instanceof Error ? err.message : "Unknown BestTime error";
      }

      if (busynessValue === null) {
        if (fallbackReason && isBestTimeForecastUnavailable(fallbackReason)) {
          await writeUnavailableBusyness(venue, new Date().toISOString());
          results.push({
            venueId: venue.id,
            ok: false,
            reason: NO_BESTTIME_FORECAST_REASON,
          });
          continue;
        }

        results.push({
          venueId: venue.id,
          ok: false,
          reason: fallbackReason ?? "BestTime did not return live or forecast busyness.",
        });
        continue;
      }

      const refreshedAt = new Date().toISOString();
      const busyness = busynessScoreForStorage(busynessValue);

      await writeBusyness(venue, bestTimeVenueId, busyness, source, refreshedAt);

      results.push({
        venueId: venue.id,
        ok: true,
        reason: fallbackReason,
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
