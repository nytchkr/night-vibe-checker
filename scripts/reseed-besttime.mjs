#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const BESTTIME_FORECAST_URL = "https://besttime.app/api/v1/forecasts";
const REQUEST_DELAY_MS = 1000;
const REPORT_PATH = path.join(process.cwd(), "smoke-reports", "NV-BESTTIME-RESEED.md");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const secrets = [
  process.env.BESTTIME_API_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
].filter(Boolean);

function redact(value) {
  let output = String(value ?? "");
  for (const secret of secrets) {
    output = output.split(secret).join("[redacted]");
  }
  return output;
}

function log(message) {
  console.log(redact(message));
}

function warn(message) {
  console.warn(redact(message));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readObject(value) {
  return value && typeof value === "object" ? value : null;
}

function readVenueId(payload) {
  const data = readObject(payload);
  const venueInfo = readObject(data?.venue_info);
  const venue = readObject(data?.venue);

  if (typeof venueInfo?.venue_id === "string" && venueInfo.venue_id.trim()) {
    return venueInfo.venue_id;
  }
  if (typeof venue?.venue_id === "string" && venue.venue_id.trim()) {
    return venue.venue_id;
  }
  if (typeof data?.venue_id === "string" && data.venue_id.trim()) {
    return data.venue_id;
  }
  return null;
}

function readBestTimeError(payload) {
  const data = readObject(payload);
  if (!data) return "No JSON response body";
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if ("message" in data) return JSON.stringify(data.message);
  if ("error" in data) return JSON.stringify(data.error);
  return "No response message";
}

async function registerBestTimeVenue(venue, apiKey) {
  const params = new URLSearchParams({
    api_key_private: apiKey,
    venue_name: venue.name,
    venue_address: venue.address ?? "",
  });

  const response = await fetch(`${BESTTIME_FORECAST_URL}?${params}`, {
    method: "POST",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  const venueId = readVenueId(payload);

  // BestTime can return HTTP 404/status Error for venues it recognizes but
  // cannot forecast yet. Those responses still include venue_info.venue_id,
  // which is enough to seed venues.besttime_venue_id for later refresh jobs.
  if ((!response.ok || payload?.status === "Error") && venueId) {
    return {
      venueId,
      note: `BestTime registered venue ID but forecast is unavailable: ${readBestTimeError(payload)}`,
    };
  }

  if (!response.ok || payload?.status === "Error") {
    throw new Error(`BestTime register failed: ${readBestTimeError(payload)}`);
  }

  if (!venueId) throw new Error("BestTime register: no venue_id in response");
  return { venueId, note: null };
}

async function countMissingBestTimeIds(supabase) {
  const { count, error } = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .or("besttime_venue_id.is.null,besttime_venue_id.eq.");

  if (error) throw new Error(`Failed to count missing BestTime IDs: ${error.message}`);
  return count ?? 0;
}

async function writeReport({ startedAt, completedAt, beforeMissing, afterMissing, results }) {
  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const lines = [
    "# NV-BESTTIME-RESEED",
    "",
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    `Missing before: ${beforeMissing}`,
    `Missing after: ${afterMissing}`,
    `Total processed: ${results.length}`,
    `Succeeded: ${succeeded.length}`,
    `Failed: ${failed.length}`,
    "",
    "## Results",
    "",
    "| Venue | Status | BestTime venue ID | Notes |",
    "|---|---:|---|---|",
    ...results.map((result) => {
      const status = result.ok ? "success" : "failed";
      return `| ${redact(result.name)} | ${status} | ${redact(result.besttimeVenueId ?? "")} | ${redact(result.reason ?? "")} |`;
    }),
    "",
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, redact(lines.join("\n")), "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bestTimeApiKey = requiredEnv("BESTTIME_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const beforeMissing = await countMissingBestTimeIds(supabase);
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, address, besttime_venue_id")
    .or("besttime_venue_id.is.null,besttime_venue_id.eq.")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load venues: ${error.message}`);

  const venues = data ?? [];
  const results = [];

  log(`Found ${venues.length} venues missing besttime_venue_id.`);

  for (const [index, venue] of venues.entries()) {
    try {
      const registration = await registerBestTimeVenue(venue, bestTimeApiKey);
      const { error: updateError } = await supabase
        .from("venues")
        .update({ besttime_venue_id: registration.venueId })
        .eq("id", venue.id);

      if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);

      results.push({
        name: venue.name,
        ok: true,
        besttimeVenueId: registration.venueId,
        reason: registration.note,
      });
      log(
        `[${index + 1}/${venues.length}] ${venue.name}: success ${registration.venueId}${
          registration.note ? ` (${registration.note})` : ""
        }`
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: venue.name,
        ok: false,
        besttimeVenueId: null,
        reason,
      });
      warn(`[${index + 1}/${venues.length}] ${venue.name}: failed ${reason}`);
    }

    if (index < venues.length - 1) await delay(REQUEST_DELAY_MS);
  }

  const afterMissing = await countMissingBestTimeIds(supabase);
  const completedAt = new Date().toISOString();
  await writeReport({ startedAt, completedAt, beforeMissing, afterMissing, results });

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  log(
    JSON.stringify(
      {
        status: failed ? "partial" : "success",
        processed: results.length,
        succeeded,
        failed,
        beforeMissing,
        afterMissing,
        report: REPORT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
