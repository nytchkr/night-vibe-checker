#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
};

type SeedFailure = {
  id: string;
  name: string;
  reason: string;
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

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readVenueId(payload: unknown): string | null {
  const data = readObject(payload);
  if (!data) return null;
  if (typeof data.venue_id === "string") return data.venue_id;

  const venueInfo = readObject(data.venue_info);
  if (typeof venueInfo?.venue_id === "string") return venueInfo.venue_id;

  const venue = readObject(data.venue);
  if (typeof venue?.venue_id === "string") return venue.venue_id;

  return null;
}

function readBestTimeError(payload: unknown): string {
  const data = readObject(payload);
  if (!data) return "No JSON response body";
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if ("message" in data) return JSON.stringify(data.message);
  if ("error" in data) return JSON.stringify(data.error);
  return "No response message";
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
    throw new Error(`BestTime forecast HTTP ${response.status}: ${readBestTimeError(payload)}`);
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
    .is("besttime_venue_id", null)
    .eq("hidden", false)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load venues: ${error.message}`);
  }

  const venues = (data ?? []) as VenueRow[];
  const failures: SeedFailure[] = [];
  let updated = 0;

  for (const venue of venues) {
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
      console.log(`updated ${venue.name} (${venue.id})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      failures.push({ id: venue.id, name: venue.name, reason });
      console.warn(`failed ${venue.name} (${venue.id}): ${reason}`);
    }

    await delay(REQUEST_DELAY_MS);
  }

  console.log(
    JSON.stringify(
      {
        status: failures.length ? "partial" : "success",
        scanned: venues.length,
        updated,
        failed: failures.length,
        failures,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
