#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 100;
const REPORT_PATH = path.join(process.cwd(), "smoke-reports", "NV-DATA-INTEGRITY.md");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const secrets = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.OPENAI_API_KEY,
  process.env.GOOGLE_PLACES_API_KEY,
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  process.env.BESTTIME_API_KEY,
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

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function formatIssue(label, count) {
  return count > 0 ? `ISSUE: ${label} = ${count}` : `OK: ${label} = ${count}`;
}

async function countRows(supabase, table, label, applyFilters) {
  const query = supabase.from(table).select("*", { count: "exact", head: true });
  const { count, error } = await applyFilters(query);
  if (error) throw new Error(`Failed to count ${label}: ${error.message}`);
  return count ?? 0;
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

async function fetchVenueIds(supabase) {
  const venues = await fetchAll(supabase, "venues", "id");
  return new Set(venues.map((venue) => venue.id));
}

function findRowsWithMissingVenue(rows, venueIds) {
  return rows.filter((row) => !row.venue_id || !venueIds.has(row.venue_id));
}

async function deleteByIds(supabase, table, idColumn, ids) {
  let deleted = 0;
  for (const batch of chunk(ids, DELETE_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from(table).delete().in(idColumn, batch);
    if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
    deleted += batch.length;
  }
  return deleted;
}

async function deleteFallbackVenues(supabase, fallbackVenues) {
  const fallbackVenueIds = fallbackVenues.map((venue) => venue.id);
  if (fallbackVenueIds.length === 0) {
    return {
      deletedVenueSignalsForFallbacks: 0,
      deletedCheckInsForFallbacks: 0,
      deletedFallbackVenues: 0,
    };
  }

  const [signals, checkIns] = await Promise.all([
    fetchAll(supabase, "venue_signals", "venue_id", (query) => query.in("venue_id", fallbackVenueIds)),
    fetchAll(supabase, "check_ins", "id, venue_id", (query) => query.in("venue_id", fallbackVenueIds)),
  ]);

  const deletedVenueSignalsForFallbacks = await deleteByIds(
    supabase,
    "venue_signals",
    "venue_id",
    [...new Set(signals.map((signal) => signal.venue_id).filter(Boolean))]
  );
  const deletedCheckInsForFallbacks = await deleteByIds(
    supabase,
    "check_ins",
    "id",
    checkIns.map((checkIn) => checkIn.id).filter(Boolean)
  );
  const deletedFallbackVenues = await deleteByIds(supabase, "venues", "id", fallbackVenueIds);

  return {
    deletedVenueSignalsForFallbacks,
    deletedCheckInsForFallbacks,
    deletedFallbackVenues,
  };
}

async function collectCounts(supabase) {
  const staleCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [
    missingLatLng,
    missingPlaceId,
    fallbackPlaceId,
    missingName,
    missingCategory,
    missingPhotoUrl,
    missingBestTimeVenueId,
    missingOpeningHours,
    staleSignals,
    signalBusynessOutOfRange,
    signalMfRatioInvalid,
    checkInsMissingUser,
    checkInsFutureCreatedAt,
  ] = await Promise.all([
    countRows(supabase, "venues", "venues missing lat/lng", (query) => query.or("lat.is.null,lng.is.null")),
    countRows(supabase, "venues", "venues missing place_id", (query) => query.or("place_id.is.null,place_id.eq.")),
    countRows(supabase, "venues", "venues with fallback place_id", (query) => query.like("place_id", "fallback:%")),
    countRows(supabase, "venues", "venues missing name", (query) => query.or("name.is.null,name.eq.")),
    countRows(supabase, "venues", "venues missing category", (query) => query.is("category", null)),
    countRows(supabase, "venues", "venues missing photo_url", (query) => query.or("photo_url.is.null,photo_url.eq.")),
    countRows(supabase, "venues", "venues missing besttime_venue_id", (query) => query.is("besttime_venue_id", null)),
    countRows(supabase, "venues", "venues missing opening_hours", (query) => query.is("opening_hours", null)),
    countRows(supabase, "venue_signals", "stale venue_signals", (query) => query.lt("updated_at", staleCutoff)),
    countRows(supabase, "venue_signals", "venue_signals busyness out of range", (query) =>
      query.or("busyness_0_100.lt.0,busyness_0_100.gt.100")
    ),
    countRows(supabase, "venue_signals", "venue_signals mf_ratio invalid", (query) => query.or("mf_ratio.lt.0,mf_ratio.gt.1")),
    countRows(supabase, "check_ins", "check_ins missing user_id", (query) => query.is("user_id", null)),
    countRows(supabase, "check_ins", "check_ins future created_at", (query) => query.gt("created_at", new Date().toISOString())),
  ]);

  const venueIds = await fetchVenueIds(supabase);
  const [signalVenueRows, checkInVenueRows] = await Promise.all([
    fetchAll(supabase, "venue_signals", "venue_id"),
    fetchAll(supabase, "check_ins", "id, venue_id"),
  ]);
  const orphanedSignalVenueIds = [
    ...new Set(findRowsWithMissingVenue(signalVenueRows, venueIds).map((row) => row.venue_id).filter(Boolean)),
  ];
  const orphanedCheckInIds = findRowsWithMissingVenue(checkInVenueRows, venueIds)
    .map((row) => row.id)
    .filter(Boolean);

  return {
    staleCutoff,
    checks: [
      { section: "venues", key: "missingLatLng", label: "venues where lat IS NULL OR lng IS NULL", count: missingLatLng },
      { section: "venues", key: "missingPlaceId", label: "venues where place_id IS NULL OR place_id = ''", count: missingPlaceId },
      { section: "venues", key: "fallbackPlaceId", label: "venues where place_id LIKE 'fallback:%'", count: fallbackPlaceId },
      { section: "venues", key: "missingName", label: "venues where name IS NULL OR name = ''", count: missingName },
      { section: "venues", key: "missingCategory", label: "venues where category IS NULL", count: missingCategory },
      { section: "venues", key: "missingPhotoUrl", label: "venues where photo_url IS NULL OR photo_url = ''", count: missingPhotoUrl },
      { section: "venues", key: "missingBestTimeVenueId", label: "venues where besttime_venue_id IS NULL", count: missingBestTimeVenueId },
      { section: "venues", key: "missingOpeningHours", label: "venues where opening_hours IS NULL", count: missingOpeningHours },
      {
        section: "venue_signals",
        key: "orphanedSignals",
        label: "venue_signals where venue_id NOT IN venues",
        count: orphanedSignalVenueIds.length,
      },
      {
        section: "venue_signals",
        key: "staleSignals",
        label: "venue_signals where updated_at < NOW() - INTERVAL '48 hours'",
        count: staleSignals,
      },
      {
        section: "venue_signals",
        key: "signalBusynessOutOfRange",
        label: "venue_signals where busyness_0_100 < 0 OR busyness_0_100 > 100",
        count: signalBusynessOutOfRange,
      },
      {
        section: "venue_signals",
        key: "signalMfRatioInvalid",
        label: "venue_signals where mf_ratio < 0 OR mf_ratio > 1",
        count: signalMfRatioInvalid,
      },
      {
        section: "check_ins",
        key: "orphanedCheckIns",
        label: "check_ins where venue_id NOT IN venues",
        count: orphanedCheckInIds.length,
      },
      { section: "check_ins", key: "checkInsMissingUser", label: "check_ins where user_id IS NULL", count: checkInsMissingUser },
      { section: "check_ins", key: "checkInsFutureCreatedAt", label: "check_ins where created_at > NOW()", count: checkInsFutureCreatedAt },
    ],
    orphanedSignalVenueIds,
    orphanedCheckInIds,
  };
}

async function runFixes(supabase, beforeCounts) {
  const fallbackVenues = await fetchAll(supabase, "venues", "id, name, place_id", (query) => query.like("place_id", "fallback:%"));

  const fallbackFix = await deleteFallbackVenues(supabase, fallbackVenues);
  const venueIdsAfterFallbackPurge = await fetchVenueIds(supabase);
  const [signalVenueRows, checkInVenueRows] = await Promise.all([
    fetchAll(supabase, "venue_signals", "venue_id"),
    fetchAll(supabase, "check_ins", "id, venue_id"),
  ]);

  const orphanedSignalVenueIds = [
    ...new Set(findRowsWithMissingVenue(signalVenueRows, venueIdsAfterFallbackPurge).map((row) => row.venue_id).filter(Boolean)),
  ];
  const orphanedCheckInIds = findRowsWithMissingVenue(checkInVenueRows, venueIdsAfterFallbackPurge)
    .map((row) => row.id)
    .filter(Boolean);

  const deletedOrphanedSignals = await deleteByIds(supabase, "venue_signals", "venue_id", orphanedSignalVenueIds);
  const deletedOrphanedCheckIns = await deleteByIds(supabase, "check_ins", "id", orphanedCheckInIds);

  return {
    ...fallbackFix,
    deletedOrphanedSignals,
    deletedOrphanedCheckIns,
    requestedOrphanedSignalsBeforeFix: beforeCounts.orphanedSignalVenueIds.length,
    requestedOrphanedCheckInsBeforeFix: beforeCounts.orphanedCheckInIds.length,
    fallbackVenues: fallbackVenues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      placeId: venue.place_id,
    })),
  };
}

async function writeReport({ startedAt, completedAt, before, after, fixes }) {
  const sections = ["venues", "venue_signals", "check_ins"];
  const lines = [
    "# NV-DATA-INTEGRITY",
    "",
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    `Stale signal cutoff: ${before.staleCutoff}`,
    "",
    "## Before Fixes",
    "",
  ];

  for (const section of sections) {
    lines.push(`### ${section}`, "");
    for (const check of before.checks.filter((item) => item.section === section)) {
      lines.push(`- ${check.count > 0 ? "ISSUE" : "OK"}: ${check.label}: ${check.count}`);
    }
    lines.push("");
  }

  lines.push(
    "## Auto-Fixes",
    "",
    `- Deleted fallback venues: ${fixes.deletedFallbackVenues}`,
    `- Deleted venue_signals attached to fallback venues before purge: ${fixes.deletedVenueSignalsForFallbacks}`,
    `- Deleted check_ins attached to fallback venues before purge: ${fixes.deletedCheckInsForFallbacks}`,
    `- Deleted orphaned venue_signals after fallback purge: ${fixes.deletedOrphanedSignals}`,
    `- Deleted orphaned check_ins after fallback purge: ${fixes.deletedOrphanedCheckIns}`,
    "",
    "## After Fixes",
    ""
  );

  for (const section of sections) {
    lines.push(`### ${section}`, "");
    for (const check of after.checks.filter((item) => item.section === section)) {
      lines.push(`- ${check.count > 0 ? "ISSUE" : "OK"}: ${check.label}: ${check.count}`);
    }
    lines.push("");
  }

  if (fixes.fallbackVenues.length > 0) {
    lines.push("## Purged Fallback Venues", "", "| ID | Name | Place ID |", "|---|---|---|");
    for (const venue of fixes.fallbackVenues) {
      lines.push(`| ${redact(venue.id)} | ${redact(venue.name ?? "")} | ${redact(venue.placeId ?? "")} |`);
    }
    lines.push("");
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, redact(lines.join("\n")), "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log("Starting NV-DATA-INTEGRITY checks.");
  const before = await collectCounts(supabase);

  for (const check of before.checks) {
    const message = formatIssue(check.label, check.count);
    if (check.count > 0) warn(message);
    else log(message);
  }

  const fixes = await runFixes(supabase, before);
  const after = await collectCounts(supabase);
  const completedAt = new Date().toISOString();

  await writeReport({ startedAt, completedAt, before, after, fixes });

  log(
    JSON.stringify(
      {
        status: after.checks.some((check) => check.count > 0) ? "issues-remain" : "clean",
        report: REPORT_PATH,
        autoFixes: fixes,
        remainingIssues: after.checks.filter((check) => check.count > 0).map((check) => ({
          key: check.key,
          count: check.count,
        })),
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
