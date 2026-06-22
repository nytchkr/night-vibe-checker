#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadDotenv(path.join(repoRoot, ".env.local"));

const GOOGLE_PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const MAX_PHOTOS = 3;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;
const MIN_NAME_SIMILARITY = 0.8;
const GOOGLE_PHOTO_PATTERNS = [
  "%maps.googleapis.com/maps/api/place/photo%",
  "%places.googleapis.com/%/photos/%",
];

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function googlePlacesKey() {
  const value = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!value) throw new Error("Missing GOOGLE_PLACES_KEY or GOOGLE_PLACES_API_KEY");
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPhotoUrl(photoReference, apiKey) {
  const url = new URL(GOOGLE_PLACE_PHOTO_URL);
  url.searchParams.set("maxwidth", "800");
  url.searchParams.set("photoreference", photoReference);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|a|an|charlotte|nc|n c|llc|inc|co|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function nameSimilarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchPlacePhotos(placeId, apiKey) {
  const url = new URL(GOOGLE_PLACES_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "photos");
  url.searchParams.set("key", apiKey);

  return fetchJson(url, "Place Details");
}

async function resolveFallbackPlaceId(venue, apiKey) {
  const url = new URL(GOOGLE_PLACES_TEXT_SEARCH_URL);
  url.searchParams.set("query", `${venue.name} South End Charlotte NC`);
  url.searchParams.set("key", apiKey);

  const json = await fetchJson(url, "Text Search");
  if (json.status !== "OK") {
    return {
      placeId: null,
      confidence: 0,
      candidateName: null,
      status: json.status,
      errorMessage: json.error_message,
    };
  }

  let best = null;
  for (const result of json.results ?? []) {
    if (!result.place_id || !result.name) continue;
    const confidence = nameSimilarity(venue.name, result.name);
    if (!best || confidence > best.confidence) {
      best = { placeId: result.place_id, confidence, candidateName: result.name, status: json.status };
    }
  }

  if (!best || best.confidence <= MIN_NAME_SIMILARITY) {
    return best ?? { placeId: null, confidence: 0, candidateName: null, status: json.status };
  }

  return best;
}

function photoUrlsFromDetails(details, apiKey) {
  if (details.status !== "OK") return [];

  return (details.result?.photos ?? [])
    .map((photo) => photo.photo_reference)
    .filter((reference) => typeof reference === "string" && reference.length > 0)
    .slice(0, MAX_PHOTOS)
    .map((reference) => buildPhotoUrl(reference, apiKey));
}

async function processVenue(venue, supabase, apiKey) {
  const result = {
    id: venue.id,
    name: venue.name,
    originalPlaceId: venue.place_id,
    resolvedPlaceId: null,
    status: "skipped",
    reason: null,
    photoCount: 0,
    matchConfidence: null,
    matchedName: null,
  };

  try {
    let placeId = venue.place_id;
    if (!placeId) {
      result.reason = "missing place_id";
      return result;
    }

    if (placeId.startsWith("fallback:")) {
      const resolved = await resolveFallbackPlaceId(venue, apiKey);
      result.matchConfidence = resolved.confidence;
      result.matchedName = resolved.candidateName;

      if (!resolved.placeId || resolved.confidence <= MIN_NAME_SIMILARITY) {
        result.reason = `no high-confidence Text Search match (status=${resolved.status ?? "UNKNOWN"})`;
        return result;
      }

      placeId = resolved.placeId;
      result.resolvedPlaceId = placeId;
    } else if (!placeId.startsWith("ChIJ")) {
      result.reason = "unsupported non-Google place_id";
      return result;
    }

    const details = await fetchPlacePhotos(placeId, apiKey);
    const photoUrls = photoUrlsFromDetails(details, apiKey);
    if (!photoUrls.length) {
      result.reason = `no photo references (details status=${details.status ?? "UNKNOWN"})`;
      return result;
    }

    const { error } = await supabase
      .from("venues")
      .update({
        place_id: placeId,
        photo_url: photoUrls[0],
        photo_urls: photoUrls,
      })
      .eq("id", venue.id);

    if (error) {
      result.status = "failed";
      result.reason = `Supabase update failed: ${error.message}`;
      return result;
    }

    result.status = "enriched";
    result.photoCount = photoUrls.length;
    return result;
  } catch (error) {
    result.status = "failed";
    result.reason = error instanceof Error ? error.message : String(error);
    return result;
  }
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count venues: ${error.message}`);
  return count ?? 0;
}

async function getCoverage(supabase) {
  const [total, unsplash, nullPhotos, legacyGoogle, newGoogle] = await Promise.all([
    countRows(supabase.from("venues").select("id", { count: "exact", head: true })),
    countRows(
      supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .ilike("photo_url", "%unsplash%"),
    ),
    countRows(
      supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .is("photo_url", null),
    ),
    countRows(
      supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .ilike("photo_url", GOOGLE_PHOTO_PATTERNS[0]),
    ),
    countRows(
      supabase
        .from("venues")
        .select("id", { count: "exact", head: true })
        .ilike("photo_url", GOOGLE_PHOTO_PATTERNS[1]),
    ),
  ]);

  return {
    total,
    google: legacyGoogle + newGoogle,
    unsplash,
    nullPhotos,
    other: Math.max(total - legacyGoogle - newGoogle - unsplash - nullPhotos, 0),
  };
}

function summarize(results) {
  const summary = {
    attempted: results.length,
    enriched: results.filter((result) => result.status === "enriched").length,
    resolvedFallbackPlaceIds: results.filter((result) => result.resolvedPlaceId).length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
  };
  return summary;
}

function reportLine(result) {
  const matched = result.matchedName
    ? `; match="${result.matchedName}" confidence=${result.matchConfidence?.toFixed(3) ?? "n/a"}`
    : "";
  const resolved = result.resolvedPlaceId ? `; resolvedPlaceId=${result.resolvedPlaceId}` : "";
  const reason = result.reason ? `; reason=${result.reason}` : "";
  return `- ${result.status.toUpperCase()}: ${result.name} (${result.id}); photos=${result.photoCount}${resolved}${matched}${reason}`;
}

async function main() {
  const apiKey = googlePlacesKey();
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: venues, error } = await supabase
    .from("venues")
    .select("id,name,address,place_id,photo_url")
    .or("photo_url.is.null,photo_url.ilike.%unsplash%")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to fetch candidate venues: ${error.message}`);

  const candidates = venues ?? [];
  const results = [];
  for (let index = 0; index < candidates.length; index += BATCH_SIZE) {
    const batch = candidates.slice(index, index + BATCH_SIZE);
    for (const [batchIndex, venue] of batch.entries()) {
      results.push(await processVenue(venue, supabase, apiKey));
      if (batchIndex < batch.length - 1) await delay(BATCH_DELAY_MS);
    }

    const processed = Math.min(index + BATCH_SIZE, candidates.length);
    console.log(`Processed ${processed}/${candidates.length}`);
    if (processed < candidates.length) await delay(BATCH_DELAY_MS);
  }

  const summary = summarize(results);
  const coverage = await getCoverage(supabase);
  const report = [
    "# NV-PHOTO-EXPAND",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Attempted: ${summary.attempted}`,
    `- Enriched: ${summary.enriched}`,
    `- Resolved fallback place IDs: ${summary.resolvedFallbackPlaceIds}`,
    `- Skipped: ${summary.skipped}`,
    `- Failed: ${summary.failed}`,
    `- Production photo coverage after run: ${coverage.google}/${coverage.total} real Google Places photo URLs`,
    `- Remaining Unsplash URLs: ${coverage.unsplash}`,
    `- Remaining null photo URLs: ${coverage.nullPhotos}`,
    `- Remaining other photo URLs: ${coverage.other}`,
    "",
    "## Method",
    "",
    "- Queried production Supabase for venues where `photo_url` is null or contains `unsplash`.",
    "- Used Place Details `fields=photos` directly for `ChIJ` Google Place IDs.",
    "- Used Text Search query `<venue name> South End Charlotte NC` for `fallback:` IDs and updated only when normalized name similarity was greater than 0.8.",
    "- Wrote only Google Places Photo API URLs built from returned `photo_reference` values.",
    "- Batches ran in groups of 10 with a 200ms delay between venue attempts.",
    "",
    "## Results",
    "",
    ...results.map(reportLine),
    "",
  ].join("\n");

  const reportPath = path.join(repoRoot, "smoke-reports", "NV-PHOTO-EXPAND.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);

  console.log(`SUMMARY ${JSON.stringify(summary)}`);
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
