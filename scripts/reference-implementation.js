/**
 * nytchkr — Agent 1 + Agent 2 reference implementation
 * Google Places discovery + BestTime busyness adapter
 *
 * Drop these two functions into your backend (Azure Functions / Node service).
 * Requires env vars: GOOGLE_PLACES_API_KEY, BESTTIME_API_KEY_PRIVATE
 *
 * npm install node-fetch   (if your runtime doesn't have global fetch)
 */

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BESTTIME_PRIVATE_KEY = process.env.BESTTIME_API_KEY_PRIVATE;

const LAUNCH_ZONE = {
  name: "Uptown / South End, Charlotte",
  center_lat: 35.2180,
  center_lng: -80.8500,
  radius_m: 2500,
};

// ---------------------------------------------------------------------------
// AGENT 1 — Google Places discovery
// Replaces any LLM/"AI discovery" function. Fast, real, no hallucination.
// ---------------------------------------------------------------------------

const PLACE_TYPES = ["bar", "night_club", "restaurant"];

/**
 * Discover real venues inside the launch zone via Google Places Nearby Search (New)
 * and upsert them into your Venue table/collection.
 *
 * @param {object} db - your data layer; must expose upsertVenue({...})
 * @param {object} zone - defaults to LAUNCH_ZONE
 */
async function discoverZone(db, zone = LAUNCH_ZONE) {
  if (!GOOGLE_PLACES_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const seen = new Set();
  const allVenues = [];

  for (const type of PLACE_TYPES) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        // Field mask is REQUIRED — omitting it errors. Only request what you use.
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.priceLevel",
          "places.primaryType",
          "places.photos",
          "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: zone.center_lat, longitude: zone.center_lng },
            radius: zone.radius_m,
          },
        },
        rankPreference: "POPULARITY",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Places API error for type=${type}:`, res.status, errBody);
      continue; // don't let one type's failure kill the whole discovery run
    }

    const data = await res.json();
    const places = data.places || [];

    for (const p of places) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.businessStatus === "CLOSED_PERMANENTLY") continue;

      allVenues.push({
        place_id: p.id,
        name: p.displayName?.text ?? "Unknown venue",
        category: mapCategory(p.primaryType, type),
        address: p.formattedAddress ?? "",
        lat: p.location?.latitude,
        lng: p.location?.longitude,
        rating: p.rating ?? null,
        price_level: mapPriceLevel(p.priceLevel),
        photo_url: await getFirstPhotoUrl(p.photos),
        zone_id: zone.name,
      });
    }
  }

  // Upsert — never duplicate on place_id
  for (const v of allVenues) {
    await db.upsertVenue(v);
  }

  return { discovered: allVenues.length, zone: zone.name };
}

function mapCategory(primaryType, requestedType) {
  const t = primaryType || requestedType;
  if (t === "night_club") return "club";
  if (t === "bar" || t === "pub" || t === "wine_bar") return "bar";
  if (t === "restaurant") return "restaurant";
  return "bar";
}

// Google returns priceLevel as an enum string in the new API, e.g. "PRICE_LEVEL_MODERATE"
function mapPriceLevel(priceLevel) {
  const map = {
    PRICE_LEVEL_FREE: "$",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return map[priceLevel] || "$$";
}

/**
 * Resolve the first Place Photo into a usable image URL.
 * The Places API (New) returns photo "name" references; you exchange those
 * for actual bytes/redirect via the Place Photo (New) media endpoint.
 */
async function getFirstPhotoUrl(photos) {
  if (!photos || !photos.length) return null;
  const photoName = photos[0].name; // e.g. "places/ChIJ.../photos/AeJ..."
  const maxWidth = 800;
  // skipHttpRedirect=false (default) lets you store this URL directly —
  // Google issues a 302 to the actual CDN image when the client requests it.
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_PLACES_KEY}`;
}

// ---------------------------------------------------------------------------
// AGENT 2 — BestTime busyness adapter
// Run on a schedule (every 30-45 min, evening hours). Never call per page-load.
// ---------------------------------------------------------------------------

const BUSY_THRESHOLDS = { dead: 33, moderate: 66 }; // 0-33 dead, 34-66 moderate, 67-100 packed

function bucketFromPercent(pct) {
  if (pct == null) return null;
  if (pct <= BUSY_THRESHOLDS.dead) return "dead";
  if (pct <= BUSY_THRESHOLDS.moderate) return "moderate";
  return "packed";
}

/**
 * For every venue in the zone, get/refresh its BestTime forecast (and live
 * data if available) and write the result into VenueSignal.
 *
 * @param {object} db - must expose:
 *   getVenuesInZone(zoneId) -> [{ id, name, address, besttime_venue_id }]
 *   writeVenueSignal({ venue_id, busyness_0_100, busyness_source, computed_at })
 *   setBesttimeVenueId(venueId, besttimeVenueId)
 */
async function refreshBusyness(db, zoneId = LAUNCH_ZONE.name) {
  if (!BESTTIME_PRIVATE_KEY) throw new Error("BESTTIME_API_KEY_PRIVATE is not set");

  const venues = await db.getVenuesInZone(zoneId);
  const results = [];

  for (const venue of venues) {
    try {
      const besttimeVenueId = venue.besttime_venue_id || (await ensureForecast(venue, db));
      if (!besttimeVenueId) {
        // BestTime has no data for this venue — leave busyness null, don't fabricate
        await db.writeVenueSignal({
          venue_id: venue.id,
          busyness_0_100: null,
          busyness_source: null,
          computed_at: new Date().toISOString(),
        });
        continue;
      }

      const live = await tryGetLive(besttimeVenueId);
      if (live != null) {
        await db.writeVenueSignal({
          venue_id: venue.id,
          busyness_0_100: live,
          busyness_source: "live",
          computed_at: new Date().toISOString(),
        });
        results.push({ venue: venue.name, busyness: live, source: "live" });
        continue;
      }

      const forecast = await getForecastNow(besttimeVenueId);
      await db.writeVenueSignal({
        venue_id: venue.id,
        busyness_0_100: forecast,
        busyness_source: forecast != null ? "forecast" : null,
        computed_at: new Date().toISOString(),
      });
      results.push({ venue: venue.name, busyness: forecast, source: "forecast" });
    } catch (err) {
      console.error(`BestTime refresh failed for ${venue.name}:`, err.message);
      // Skip this venue this cycle — do not write fabricated data on error
    }

    // BestTime free/standard tiers rate-limit; pace requests gently
    await sleep(150);
  }

  return results;
}

/**
 * Create a forecast for a venue that doesn't have a besttime_venue_id yet,
 * store the id for future calls (so we never re-pay for the same venue), and
 * return the id. Returns null if BestTime can't find/forecast this venue.
 */
async function ensureForecast(venue, db) {
  const params = new URLSearchParams({
    api_key_private: BESTTIME_PRIVATE_KEY,
    venue_name: venue.name,
    venue_address: venue.address,
  });

  const res = await fetch(`https://besttime.app/api/v1/forecasts?${params.toString()}`, {
    method: "POST",
  });
  const data = await res.json();

  if (data.status !== "OK" || !data.venue_info?.venue_id) {
    console.warn(`BestTime found no forecast for "${venue.name}"`);
    return null;
  }

  await db.setBesttimeVenueId(venue.id, data.venue_info.venue_id);
  return data.venue_info.venue_id;
}

/**
 * Try the live endpoint. Returns a 0-100 percent or null if no live data
 * exists for this venue (common — live needs more traffic volume than a
 * forecast does).
 */
async function tryGetLive(besttimeVenueId) {
  const params = new URLSearchParams({
    api_key_private: BESTTIME_PRIVATE_KEY,
    venue_id: besttimeVenueId,
  });

  const res = await fetch(`https://beta.besttime.app/api/v1/forecast/live?${params.toString()}`, {
    method: "POST",
  });
  const data = await res.json();

  if (data.status !== "OK") return null;
  const pct = data.analysis?.venue_live_busyness;
  return typeof pct === "number" ? Math.round(pct) : null;
}

/**
 * Read today's forecasted busyness for the current local hour from the
 * already-created forecast (no extra credit charge — this just queries it).
 */
async function getForecastNow(besttimeVenueId) {
  const params = new URLSearchParams({
    api_key_private: BESTTIME_PRIVATE_KEY,
    venue_id: besttimeVenueId,
  });

  const res = await fetch(`https://besttime.app/api/v1/forecasts?${params.toString()}`, {
    method: "POST",
  });
  const data = await res.json();
  if (data.status !== "OK") return null;

  const now = new Date();
  const dayInt = (now.getDay() + 6) % 7; // BestTime: 0=Monday..6=Sunday
  const hour = now.getHours();

  const dayAnalysis = data.analysis?.find((d) => d.day_int === dayInt);
  if (!dayAnalysis?.day_raw) return null;

  // day_raw is an array of hourly percentages starting at hour 0
  const pct = dayAnalysis.day_raw[hour];
  return typeof pct === "number" ? Math.round(pct) : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Usage in your scheduled job / Azure Function:
//
//   await discoverZone(db);              // run once, then occasionally (new venues)
//   await refreshBusyness(db);           // every 30-45 min, evening hours only
//
// Both expose `bucketFromPercent(pct)` for the UI layer to turn the 0-100
// number into the dead/moderate/packed label and color shown in section 6
// of the master prompt.
// ---------------------------------------------------------------------------

module.exports = {
  LAUNCH_ZONE,
  discoverZone,
  refreshBusyness,
  bucketFromPercent,
};
