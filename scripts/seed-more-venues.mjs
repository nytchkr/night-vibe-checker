#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const GOOGLE_PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
const GOOGLE_PLACES_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const SEARCH_TYPES = ["bar", "night_club", "restaurant"];
const ZONE_ID = "south-end-charlotte";
const CENTER_LAT = 35.2180;
const CENTER_LNG = -80.8500;
const RADIUS_M = 2500;
const PAGE_TOKEN_DELAY_MS = 2200;
const TARGET_MAX_VENUES = 100;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [rawKey, ...valueParts] = trimmed.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key]) continue;

    let value = valueParts.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNearbyPage({ apiKey, type, pageToken }) {
  const url = new URL(GOOGLE_PLACES_NEARBY_URL);
  url.searchParams.set("key", apiKey);

  if (pageToken) {
    url.searchParams.set("pagetoken", pageToken);
  } else {
    url.searchParams.set("location", `${CENTER_LAT},${CENTER_LNG}`);
    url.searchParams.set("radius", String(RADIUS_M));
    url.searchParams.set("type", type);
  }

  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Places Nearby Search HTTP ${response.status} for ${type}`);
  }

  return payload;
}

async function fetchNearbyAllPages(apiKey, type) {
  const results = [];
  let pageToken = null;
  let page = 0;

  do {
    if (pageToken) await delay(PAGE_TOKEN_DELAY_MS);

    const payload = await fetchNearbyPage({ apiKey, type, pageToken });
    if (payload.status === "INVALID_REQUEST" && pageToken) {
      await delay(PAGE_TOKEN_DELAY_MS);
      const retryPayload = await fetchNearbyPage({ apiKey, type, pageToken });
      if (retryPayload.status !== "OK" && retryPayload.status !== "ZERO_RESULTS") {
        throw new Error(formatPlacesError(retryPayload, type));
      }
      results.push(...(retryPayload.results ?? []));
      pageToken = retryPayload.next_page_token ?? null;
      page += 1;
      continue;
    }

    if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
      throw new Error(formatPlacesError(payload, type));
    }

    results.push(...(payload.results ?? []));
    pageToken = payload.next_page_token ?? null;
    page += 1;
  } while (pageToken && page < 3);

  return results;
}

function formatPlacesError(payload, type) {
  const message = payload?.error_message ? `: ${payload.error_message}` : "";
  return `Google Places Nearby Search for ${type} returned ${payload?.status ?? "UNKNOWN"}${message}`;
}

function firstPhotoUrl(result, apiKey) {
  const photoReference = result.photos?.find((photo) => photo.photo_reference)?.photo_reference;
  if (!photoReference) return null;

  const url = new URL(GOOGLE_PLACES_PHOTO_URL);
  url.searchParams.set("maxwidth", "800");
  url.searchParams.set("photoreference", photoReference);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function toVenueRow(result, category, apiKey, now) {
  const placeId = result.place_id;
  const name = result.name;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;

  if (!placeId || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const photoReference = result.photos?.find((photo) => photo.photo_reference)?.photo_reference ?? null;
  const rating = Number.isFinite(result.rating) ? result.rating : null;
  const priceLevel = Number.isInteger(result.price_level) ? result.price_level : null;

  return {
    place_id: placeId,
    name,
    category,
    venue_type: category,
    address: result.vicinity ?? result.formatted_address ?? "",
    lat,
    lng,
    photo_reference: photoReference,
    photo_url: firstPhotoUrl(result, apiKey),
    google_rating: rating,
    rating,
    total_ratings: Number.isInteger(result.user_ratings_total) ? result.user_ratings_total : null,
    price_level: priceLevel,
    zone_id: ZONE_ID,
    hidden: false,
    updated_at: now,
  };
}

function categoryRank(category) {
  if (category === "night_club") return 3;
  if (category === "bar") return 2;
  return 1;
}

function venueRank(row) {
  const rating = Number.isFinite(row.google_rating) ? row.google_rating : 0;
  const totalRatings = Number.isFinite(row.total_ratings) ? row.total_ratings : 0;
  return categoryRank(row.category) * 1_000_000 + rating * 100_000 + Math.min(totalRatings, 99_999);
}

function selectRowsForTarget(rows, existingCount) {
  const capacity = Math.max(0, TARGET_MAX_VENUES - existingCount);
  return [...rows].sort((a, b) => venueRank(b) - venueRank(a) || a.name.localeCompare(b.name)).slice(0, capacity);
}

async function countVenues(supabase) {
  const { count, error } = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("zone_id", ZONE_ID);

  if (error) throw new Error(`Failed to count venues: ${error.message}`);
  return count ?? 0;
}

async function main() {
  loadEnvFile(path.join(REPO_ROOT, ".env.local"));

  const googlePlacesApiKey = requiredEnv("GOOGLE_PLACES_API_KEY");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const beforeCount = await countVenues(supabase);
  const byPlaceId = new Map();

  for (const type of SEARCH_TYPES) {
    const results = await fetchNearbyAllPages(googlePlacesApiKey, type);
    console.log(`${type}: fetched ${results.length} Google Places results`);

    for (const result of results) {
      if (!result.place_id || byPlaceId.has(result.place_id)) continue;
      const row = toVenueRow(result, type, googlePlacesApiKey, new Date().toISOString());
      if (row) byPlaceId.set(result.place_id, row);
    }
  }

  const rows = Array.from(byPlaceId.values());
  if (!rows.length) throw new Error("Google Places returned no upsertable venues.");
  const rowsToUpsert = selectRowsForTarget(rows, beforeCount);

  if (rowsToUpsert.length > 0) {
    const { error } = await supabase.from("venues").upsert(rowsToUpsert, { onConflict: "place_id" });
    if (error) throw new Error(`Failed to upsert venues: ${error.message}`);
  }

  const afterCount = await countVenues(supabase);
  console.log(`Unique Google Places venues discovered: ${rows.length}`);
  console.log(`Unique Google Places venues upserted: ${rowsToUpsert.length}`);
  console.log(`South End venue count before: ${beforeCount}`);
  console.log(`South End venue count after: ${afterCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
