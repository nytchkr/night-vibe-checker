#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const FIELD_MASK = "currentPopularityScore";
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 200;
const REPORT_PATH = path.join(process.cwd(), "smoke-reports", "NV-DATA-019-FIX.md");

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

function readPopularityScore(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

async function fetchAll(supabase, table, select, applyFilters = (query) => query) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const query = applyFilters(supabase.from(table).select(select)).range(from, to);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load ${table}: ${error.message}`);

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function countRows(supabase, table, applyFilters = (query) => query) {
  const query = applyFilters(supabase.from(table).select("*", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchCurrentPopularityScore(placeId, googlePlacesKey) {
  const url = new URL(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeResourceId(placeId))}`);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": googlePlacesKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      score: null,
      reason: payload?.error?.message ?? `Google Places HTTP ${response.status}`,
    };
  }

  return {
    score: readPopularityScore(payload?.currentPopularityScore),
    reason: payload?.currentPopularityScore == null ? "currentPopularityScore missing" : "currentPopularityScore invalid",
  };
}

async function collectCounts(supabase) {
  const [totalVenues, signalsTotal, signalsWithBusyness, liveSignals, unavailableSignals, nullBusynessSignals, missingBesttime] =
    await Promise.all([
      countRows(supabase, "venues"),
      countRows(supabase, "venue_signals"),
      countRows(supabase, "venue_signals", (query) => query.not("busyness_0_100", "is", null)),
      countRows(supabase, "venue_signals", (query) => query.eq("busyness_source", "live")),
      countRows(supabase, "venue_signals", (query) => query.eq("busyness_source", "unavailable")),
      countRows(supabase, "venue_signals", (query) => query.is("busyness_0_100", null)),
      countRows(supabase, "venues", (query) => query.is("besttime_venue_id", null)),
    ]);

  return {
    totalVenues,
    signalsTotal,
    signalsWithBusyness,
    liveSignals,
    unavailableSignals,
    nullBusynessSignals,
    missingBesttime,
  };
}

async function writeReport({ startedAt, completedAt, beforeCounts, afterCounts, targetCount, results }) {
  const lines = [
    "# NV-DATA-019-FIX",
    "",
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Secrets: [redacted]",
    "",
    "## Counts",
    "",
    "| Metric | Before | After |",
    "|---|---:|---:|",
    `| Total venues | ${beforeCounts.totalVenues} | ${afterCounts.totalVenues} |`,
    `| venue_signals total | ${beforeCounts.signalsTotal} | ${afterCounts.signalsTotal} |`,
    `| venue_signals where busyness_0_100 is not null | ${beforeCounts.signalsWithBusyness} | ${afterCounts.signalsWithBusyness} |`,
    `| venue_signals where busyness_source = live | ${beforeCounts.liveSignals} | ${afterCounts.liveSignals} |`,
    `| venue_signals where busyness_source = unavailable | ${beforeCounts.unavailableSignals} | ${afterCounts.unavailableSignals} |`,
    `| venue_signals where busyness_0_100 is null | ${beforeCounts.nullBusynessSignals} | ${afterCounts.nullBusynessSignals} |`,
    `| venues where besttime_venue_id is null | ${beforeCounts.missingBesttime} | ${afterCounts.missingBesttime} |`,
    "",
    `Targeted venues: ${targetCount}`,
    `Live scores written: ${results.filter((result) => result.status === "live").length}`,
    `Unavailable rows written: ${results.filter((result) => result.status === "unavailable").length}`,
    `Retained existing busyness: ${results.filter((result) => result.status === "retained").length}`,
    `Skipped: ${results.filter((result) => result.status === "skipped").length}`,
    `Failed: ${results.filter((result) => result.status === "failed").length}`,
    "",
    "## Results",
    "",
    "| Venue | Status | Note |",
    "|---|---|---|",
    ...results.map((result) => `| ${redact(result.name)} | ${result.status} | ${redact(result.note)} |`),
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

  const beforeCounts = await collectCounts(supabase);
  const [venues, signals] = await Promise.all([
    fetchAll(supabase, "venues", "id, place_id, name, besttime_venue_id"),
    fetchAll(supabase, "venue_signals", "venue_id, busyness_0_100"),
  ]);
  const signalByVenueId = new Map(signals.map((signal) => [signal.venue_id, signal]));
  const targetVenues = venues.filter((venue) => {
    const signal = signalByVenueId.get(venue.id);
    return venue.besttime_venue_id == null || signal?.busyness_0_100 == null;
  });
  const results = [];

  log(`Found ${venues.length} venues; targeting ${targetVenues.length} missing-BestTime or missing-busyness venues.`);

  for (const [index, venue] of targetVenues.entries()) {
    const existingSignal = signalByVenueId.get(venue.id);

    if (!hasValidPlaceId(venue.place_id)) {
      results.push({ name: venue.name, status: "skipped", note: "Missing or fallback place_id" });
      log(`[${index + 1}/${targetVenues.length}] ${venue.name}: skipped missing/fallback place_id`);
      continue;
    }

    try {
      const refreshedAt = new Date().toISOString();
      const { score, reason } = await fetchCurrentPopularityScore(venue.place_id, googlePlacesKey);

      if (score != null) {
        const { error } = await supabase.from("venue_signals").upsert(
          {
            venue_id: venue.id,
            place_id: venue.place_id,
            busyness_0_100: score,
            busyness_source: "live",
            confidence_0_1: 0.8,
            computed_at: refreshedAt,
            last_busyness_refresh: refreshedAt,
          },
          { onConflict: "venue_id" }
        );
        if (error) throw new Error(`Supabase venue_signals upsert failed: ${error.message}`);
        results.push({ name: venue.name, status: "live", note: `currentPopularityScore=${score}` });
        log(`[${index + 1}/${targetVenues.length}] ${venue.name}: live score ${score}`);
      } else if (existingSignal?.busyness_0_100 != null) {
        results.push({ name: venue.name, status: "retained", note: `No Google live score; retained existing busyness (${reason})` });
        log(`[${index + 1}/${targetVenues.length}] ${venue.name}: retained existing busyness`);
      } else {
        const { error } = await supabase.from("venue_signals").upsert(
          {
            venue_id: venue.id,
            place_id: venue.place_id,
            busyness_0_100: null,
            busyness_source: "unavailable",
            confidence_0_1: 0,
            computed_at: refreshedAt,
            last_busyness_refresh: refreshedAt,
          },
          { onConflict: "venue_id" }
        );
        if (error) throw new Error(`Supabase venue_signals unavailable upsert failed: ${error.message}`);
        results.push({ name: venue.name, status: "unavailable", note: reason });
        log(`[${index + 1}/${targetVenues.length}] ${venue.name}: unavailable (${reason})`);
      }
    } catch (err) {
      const note = err instanceof Error ? err.message : "Unknown error";
      results.push({ name: venue.name, status: "failed", note });
      warn(`[${index + 1}/${targetVenues.length}] ${venue.name}: failed ${note}`);
    }

    if (index < targetVenues.length - 1) await delay(REQUEST_DELAY_MS);
  }

  const afterCounts = await collectCounts(supabase);
  const completedAt = new Date().toISOString();
  await writeReport({
    startedAt,
    completedAt,
    beforeCounts,
    afterCounts,
    targetCount: targetVenues.length,
    results,
  });

  log(
    JSON.stringify(
      {
        status: results.some((result) => result.status === "failed") ? "partial" : "success",
        targeted: targetVenues.length,
        liveScoresWritten: results.filter((result) => result.status === "live").length,
        unavailableWritten: results.filter((result) => result.status === "unavailable").length,
        retained: results.filter((result) => result.status === "retained").length,
        finalSignalsWithBusyness: afterCounts.signalsWithBusyness,
        finalUnavailableSignals: afterCounts.unavailableSignals,
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
