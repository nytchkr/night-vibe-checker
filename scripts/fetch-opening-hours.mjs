#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const REQUEST_DELAY_MS = 200;
const PAGE_SIZE = 1000;
const REPORT_PATH = path.join(process.cwd(), "smoke-reports", "NV-OPEN-HOURS.md");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const secrets = [
  process.env.GOOGLE_PLACES_KEY,
  process.env.GOOGLE_PLACES_API_KEY,
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

function hasValidPlaceId(placeId) {
  return typeof placeId === "string" && placeId.trim().length > 0 && !placeId.startsWith("fallback:");
}

function placeResourceId(placeId) {
  return placeId.startsWith("places/") ? placeId.slice("places/".length) : placeId;
}

function hasGoogleOpeningHours(openingHours) {
  return Boolean(
    openingHours &&
      typeof openingHours === "object" &&
      !Array.isArray(openingHours) &&
      Array.isArray(openingHours.periods)
  );
}

async function fetchAllRows(supabase, select, applyFilters = (query) => query) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = applyFilters(supabase.from("venues").select(select).order("name", { ascending: true }));
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(`Failed to load venues: ${error.message}`);

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchGoogleOpeningHours(placeId, googlePlacesKey) {
  const url = new URL(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeResourceId(placeId))}`);
  url.searchParams.set("fields", "regularOpeningHours");

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": googlePlacesKey,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? `Google Places HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload?.regularOpeningHours ?? null;
}

async function writeReport({ startedAt, completedAt, totalVenues, realHoursCount, fallbackCount, results }) {
  const saved = results.filter((result) => result.status === "saved");
  const skipped = results.filter((result) => result.status === "skipped");
  const failed = results.filter((result) => result.status === "failed");
  const noHours = results.filter((result) => result.status === "no-hours");

  const lines = [
    "# NV-OPEN-HOURS",
    "",
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    `Total venues: ${totalVenues}`,
    `Venues with real Google hours: ${realHoursCount}`,
    `Venues still using heuristic fallback: ${fallbackCount}`,
    `Saved this run: ${saved.length}`,
    `No hours returned this run: ${noHours.length}`,
    `Skipped this run: ${skipped.length}`,
    `Failed this run: ${failed.length}`,
    "",
    "## Results",
    "",
    "| Venue | Status | Notes |",
    "|---|---:|---|",
    ...results.map((result) => `| ${redact(result.name)} | ${result.status} | ${redact(result.note ?? "")} |`),
    "",
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, redact(lines.join("\n")), "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const googlePlacesKey = process.env.GOOGLE_PLACES_KEY || requiredEnv("GOOGLE_PLACES_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const venues = await fetchAllRows(
    supabase,
    "id, name, place_id, opening_hours",
    (query) => query.is("opening_hours", null)
  );
  const results = [];

  log(`Found ${venues.length} venues with opening_hours IS NULL.`);

  for (const [index, venue] of venues.entries()) {
    if (!hasValidPlaceId(venue.place_id)) {
      results.push({
        name: venue.name,
        status: "skipped",
        note: "Missing or fallback place_id",
      });
      log(`[${index + 1}/${venues.length}] ${venue.name}: skipped missing/fallback place_id`);
      continue;
    }

    try {
      const openingHours = await fetchGoogleOpeningHours(venue.place_id, googlePlacesKey);
      if (!openingHours) {
        results.push({
          name: venue.name,
          status: "no-hours",
          note: "Google Places returned no regularOpeningHours",
        });
        warn(`[${index + 1}/${venues.length}] ${venue.name}: no regularOpeningHours returned`);
      } else {
        const { error } = await supabase
          .from("venues")
          .update({ opening_hours: openingHours })
          .eq("id", venue.id);
        if (error) throw new Error(`Supabase update failed: ${error.message}`);

        results.push({
          name: venue.name,
          status: "saved",
          note: `${Array.isArray(openingHours.periods) ? openingHours.periods.length : 0} period(s)`,
        });
        log(`[${index + 1}/${venues.length}] ${venue.name}: saved regularOpeningHours`);
      }
    } catch (err) {
      const note = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: venue.name,
        status: "failed",
        note,
      });
      warn(`[${index + 1}/${venues.length}] ${venue.name}: failed ${note}`);
    }

    if (index < venues.length - 1) await delay(REQUEST_DELAY_MS);
  }

  const allVenues = await fetchAllRows(supabase, "id, name, place_id, opening_hours");
  const realHoursCount = allVenues.filter((venue) => hasGoogleOpeningHours(venue.opening_hours)).length;
  const fallbackCount = allVenues.length - realHoursCount;
  const completedAt = new Date().toISOString();

  await writeReport({
    startedAt,
    completedAt,
    totalVenues: allVenues.length,
    realHoursCount,
    fallbackCount,
    results,
  });

  log(
    JSON.stringify(
      {
        status: results.some((result) => result.status === "failed") ? "partial" : "success",
        processed: results.length,
        saved: results.filter((result) => result.status === "saved").length,
        realHoursCount,
        fallbackCount,
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

