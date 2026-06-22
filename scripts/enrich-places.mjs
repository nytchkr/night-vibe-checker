#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const STATIC_FIELD_MASK = [
  "priceLevel",
  "rating",
  "userRatingCount",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "currentOpeningHours",
  "regularOpeningHours",
  "editorialSummary",
].join(",");

const FIELD_MASK = [
  STATIC_FIELD_MASK,
  "currentPopularityScore",
].join(",");
const REQUEST_DELAY_MS = 200;
const PAGE_SIZE = 1000;
const REPORT_PATH = path.join(process.cwd(), "smoke-reports", "NV-PLACES-ENRICH.md");

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

function mapPriceLevel(priceLevel) {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
    case "FREE":
      return null;
    case "PRICE_LEVEL_INEXPENSIVE":
    case "INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
    case "MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
    case "EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
    case "VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
}

function readFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value) {
  const number = readFiniteNumber(value);
  return number == null ? null : Math.round(number);
}

function isRicherOpeningHours(next, current) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return false;
  const nextPeriods = Array.isArray(next.periods) ? next.periods.length : 0;
  const currentPeriods =
    current && typeof current === "object" && !Array.isArray(current) && Array.isArray(current.periods)
      ? current.periods.length
      : 0;
  if (nextPeriods > currentPeriods) return true;

  const nextDescriptions = Array.isArray(next.weekdayDescriptions) ? next.weekdayDescriptions.length : 0;
  const currentDescriptions =
    current && typeof current === "object" && !Array.isArray(current) && Array.isArray(current.weekdayDescriptions)
      ? current.weekdayDescriptions.length
      : 0;
  return nextDescriptions > currentDescriptions;
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

async function fetchPlaceDetailsWithMask(placeId, googlePlacesKey, fieldMask) {
  const url = new URL(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeResourceId(placeId))}`);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": googlePlacesKey,
      "X-Goog-FieldMask": fieldMask,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Google Places HTTP ${response.status}`);
  }

  return payload ?? {};
}

async function fetchPlaceDetails(placeId, googlePlacesKey) {
  try {
    return {
      details: await fetchPlaceDetailsWithMask(placeId, googlePlacesKey, FIELD_MASK),
      popularityFieldAvailable: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!message.toLowerCase().includes("invalid argument")) throw err;
    return {
      details: await fetchPlaceDetailsWithMask(placeId, googlePlacesKey, STATIC_FIELD_MASK),
      popularityFieldAvailable: false,
    };
  }
}

function buildVenueUpdate(details, currentOpeningHours, refreshedAt) {
  const update = {};
  const priceLevel = mapPriceLevel(details.priceLevel);
  const rating = readFiniteNumber(details.rating);
  const userRatingCount = readInteger(details.userRatingCount);
  const popularity = readInteger(details.currentPopularityScore);

  if (priceLevel !== undefined) update.price_level = priceLevel;
  if (rating != null) update.rating = Number(rating.toFixed(1));
  if (userRatingCount != null) update.user_rating_count = userRatingCount;
  if (typeof details.websiteUri === "string" && details.websiteUri.trim()) update.website = details.websiteUri.trim();
  if (typeof details.nationalPhoneNumber === "string" && details.nationalPhoneNumber.trim()) {
    update.phone_number = details.nationalPhoneNumber.trim();
    update.phone = details.nationalPhoneNumber.trim();
  }
  if (typeof details.googleMapsUri === "string" && details.googleMapsUri.trim()) update.google_maps_uri = details.googleMapsUri.trim();
  if (popularity != null && popularity >= 0 && popularity <= 100) {
    update.current_popularity = popularity;
    update.current_popularity_updated_at = refreshedAt;
  }
  if (typeof details.editorialSummary?.text === "string" && details.editorialSummary.text.trim()) {
    update.editorial_summary = details.editorialSummary.text.trim();
  }
  if (isRicherOpeningHours(details.regularOpeningHours, currentOpeningHours)) {
    update.opening_hours = details.regularOpeningHours;
  }

  return update;
}

async function writeReport({ startedAt, completedAt, totalVenues, attempted, results }) {
  const enriched = results.filter((result) => result.status === "enriched");
  const skipped = results.filter((result) => result.status === "skipped");
  const failed = results.filter((result) => result.status === "failed");
  const popularitySignals = results.filter((result) => result.popularityUpdated);

  const lines = [
    "# NV-PLACES-ENRICH",
    "",
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    `Total venues: ${totalVenues}`,
    `Attempted valid Google place IDs: ${attempted}`,
    `Enriched: ${enriched.length}`,
    `Live popularity signals written: ${popularitySignals.length}`,
    `Skipped: ${skipped.length}`,
    `Failed: ${failed.length}`,
    "",
    "Secrets: [redacted]",
    "",
    "## Results",
    "",
    "| Venue | Status | Fields | Notes |",
    "|---|---:|---|---|",
    ...results.map((result) => {
      const fields = result.fields?.length ? result.fields.join(", ") : "-";
      return `| ${redact(result.name)} | ${result.status} | ${fields} | ${redact(result.note ?? "")} |`;
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
  const googlePlacesKey = process.env.GOOGLE_PLACES_KEY || requiredEnv("GOOGLE_PLACES_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const venues = await fetchAllRows(supabase, "id, name, place_id, opening_hours");
  const results = [];
  let attempted = 0;

  log(`Found ${venues.length} venues.`);

  for (const [index, venue] of venues.entries()) {
    if (!hasValidPlaceId(venue.place_id)) {
      results.push({
        name: venue.name,
        status: "skipped",
        fields: [],
        note: "Missing or fallback place_id",
        popularityUpdated: false,
      });
      log(`[${index + 1}/${venues.length}] ${venue.name}: skipped missing/fallback place_id`);
      continue;
    }

    attempted += 1;

    try {
      const refreshedAt = new Date().toISOString();
      const { details, popularityFieldAvailable } = await fetchPlaceDetails(venue.place_id, googlePlacesKey);
      const update = buildVenueUpdate(details, venue.opening_hours, refreshedAt);
      const fields = Object.keys(update);

      if (fields.length > 0) {
        const { error } = await supabase.from("venues").update(update).eq("id", venue.id);
        if (error) throw new Error(`Supabase venue update failed: ${error.message}`);
      }

      const popularity = readInteger(details.currentPopularityScore);
      let popularityUpdated = false;
      if (popularity != null && popularity > 0 && popularity <= 100) {
        const { error } = await supabase.from("venue_signals").upsert(
          {
            venue_id: venue.id,
            place_id: venue.place_id,
            busyness_0_100: popularity,
            busyness_source: "live",
            confidence_0_1: 0.85,
            computed_at: refreshedAt,
            last_busyness_refresh: refreshedAt,
          },
          { onConflict: "venue_id" }
        );
        if (error) throw new Error(`Supabase venue_signals upsert failed: ${error.message}`);
        popularityUpdated = true;
      }

      results.push({
        name: venue.name,
        status: "enriched",
        fields,
        note: popularityUpdated
          ? "live popularity signal written"
          : popularityFieldAvailable
            ? "details updated"
            : "details updated; currentPopularityScore rejected by Google field mask",
        popularityUpdated,
      });
      log(`[${index + 1}/${venues.length}] ${venue.name}: updated ${fields.length ? fields.join(", ") : "no venue fields"}${popularityUpdated ? ", live signal" : ""}`);
    } catch (err) {
      const note = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: venue.name,
        status: "failed",
        fields: [],
        note,
        popularityUpdated: false,
      });
      warn(`[${index + 1}/${venues.length}] ${venue.name}: failed ${note}`);
    }

    if (index < venues.length - 1) await delay(REQUEST_DELAY_MS);
  }

  const completedAt = new Date().toISOString();
  await writeReport({
    startedAt,
    completedAt,
    totalVenues: venues.length,
    attempted,
    results,
  });

  log(
    JSON.stringify(
      {
        status: results.some((result) => result.status === "failed") ? "partial" : "success",
        processed: results.length,
        attempted,
        enriched: results.filter((result) => result.status === "enriched").length,
        livePopularitySignals: results.filter((result) => result.popularityUpdated).length,
        failed: results.filter((result) => result.status === "failed").length,
        report: REPORT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exitCode = 1;
});
