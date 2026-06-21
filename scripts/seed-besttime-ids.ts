import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
};

const BESTTIME_FORECAST_URL = "https://besttime.app/api/v1/forecasts";
const REQUEST_DELAY_MS = 250;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readVenueId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.venue_id === "string") return data.venue_id;

  const venueInfo = data.venue_info;
  if (venueInfo && typeof venueInfo === "object") {
    const venueId = (venueInfo as Record<string, unknown>).venue_id;
    if (typeof venueId === "string") return venueId;
  }

  const venue = data.venue;
  if (venue && typeof venue === "object") {
    const venueId = (venue as Record<string, unknown>).venue_id;
    if (typeof venueId === "string") return venueId;
  }

  return null;
}

async function getBestTimeVenueId(venue: VenueRow, apiKey: string): Promise<string> {
  const params = new URLSearchParams({
    api_key_private: apiKey,
    venue_name: venue.name,
    venue_address: venue.address ?? "",
  });

  const response = await fetch(`${BESTTIME_FORECAST_URL}?${params}`, {
    method: "POST",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? JSON.stringify((payload as Record<string, unknown>).message)
        : "No response message";
    throw new Error(`BestTime forecast HTTP ${response.status}: ${message}`);
  }

  const venueId = readVenueId(payload);
  if (!venueId) {
    throw new Error("BestTime forecast response did not include venue_id");
  }

  return venueId;
}

async function main(): Promise<void> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bestTimeApiKey = requiredEnv("BESTTIME_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, address")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load venues: ${error.message}`);
  }

  let updated = 0;
  for (const venue of (data ?? []) as VenueRow[]) {
    try {
      const bestTimeVenueId = await getBestTimeVenueId(venue, bestTimeApiKey);
      const { error: updateError } = await supabase
        .from("venues")
        .update({ besttime_venue_id: bestTimeVenueId, updated_at: new Date().toISOString() })
        .eq("id", venue.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(`BestTime ID seed failed for ${venue.name} (${venue.id}): ${message}`);
    }

    await delay(REQUEST_DELAY_MS);
  }

  console.log(`Updated ${updated} venues with BestTime IDs`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
