#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const ZONE_ID = "south-end-charlotte";
const LOOKBACK_MINUTES = 120;
const HALF_LIFE_MINUTES = 45;
const MIN_NEFF_FOR_RATIO = 2;
const CHECK_INS_PER_VENUE_MIN = 4;
const CHECK_INS_PER_VENUE_MAX = 6;

const isDryRun = process.argv.includes("--dry-run");
const isRecomputeOnly = process.argv.includes("--recompute-only");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with .env.local loaded.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseWeighted(random, entries) {
  const roll = random();
  let cursor = 0;
  for (const [value, weight] of entries) {
    cursor += weight;
    if (roll <= cursor) return value;
  }
  return entries.at(-1)[0];
}

function isWeekendNight(date = new Date()) {
  const day = date.getDay();
  return day === 5 || day === 6;
}

function generatedAtFor(index, total, random) {
  const spread = total <= 1 ? 0 : index / (total - 1);
  const baseMinutesAgo = 6 + Math.round(spread * 84);
  const jitter = Math.round((random() - 0.5) * 10);
  return new Date(Date.now() - Math.max(1, baseMinutesAgo + jitter) * 60_000).toISOString();
}

function crowdFeelFor(random) {
  return chooseWeighted(random, [
    ["mostly_male", 0.6],
    ["balanced", 0.25],
    ["mostly_female", 0.15],
  ]);
}

function busynessFor(random, weekendNight) {
  if (weekendNight) {
    return chooseWeighted(random, [
      ["packed", 0.58],
      ["moderate", 0.36],
      ["dead", 0.06],
    ]);
  }

  return chooseWeighted(random, [
    ["dead", 0.45],
    ["moderate", 0.48],
    ["packed", 0.07],
  ]);
}

function noteFor({ venueName, busyness, crowdFeel }, random) {
  const packedNotes = [
    "Line moving but the room is full.",
    "Strong launch-night energy.",
    "Busy around the bar, patio has space.",
  ];
  const moderateNotes = [
    "Good crowd without feeling slammed.",
    "Easy to move around, still lively.",
    "Steady group near the bar.",
  ];
  const deadNotes = [
    "Slow start, plenty of room.",
    "Quiet right now.",
    "Open tables and no wait.",
  ];
  const crowdNotes = {
    mostly_male: "Skews guys tonight.",
    balanced: "Crowd mix feels balanced.",
    mostly_female: "Skews girls tonight.",
  };
  const notes = busyness === "packed" ? packedNotes : busyness === "dead" ? deadNotes : moderateNotes;
  const base = notes[Math.floor(random() * notes.length)];
  const crowd = crowdNotes[crowdFeel] ?? "Mixed crowd tonight.";
  return `${base} ${crowd} (${venueName})`.slice(0, 200);
}

function buildRowsForVenue(venue, index, weekendNight) {
  const random = mulberry32(hashString(`${venue.id}:${venue.place_id}:${index}`));
  const total = CHECK_INS_PER_VENUE_MIN + Math.floor(random() * (CHECK_INS_PER_VENUE_MAX - CHECK_INS_PER_VENUE_MIN + 1));

  return Array.from({ length: total }, (_, rowIndex) => {
    const busyness = busynessFor(random, weekendNight);
    const crowdFeel = crowdFeelFor(random);
    return {
      venue_id: venue.id,
      place_id: venue.place_id,
      user_id: null,
      busyness,
      crowd_feel: crowdFeel,
      hidden: false,
      note: noteFor({ venueName: venue.name, busyness, crowdFeel }, random),
      created_at: generatedAtFor(rowIndex, total, random),
    };
  });
}

function busynessToScore(busyness) {
  if (busyness === "dead") return 16;
  if (busyness === "packed") return 84;
  return 50;
}

function crowdFeelToMaleValue(crowdFeel) {
  if (crowdFeel === "mostly_male") return 100;
  if (crowdFeel === "mostly_female") return 0;
  return 50;
}

function computeSignalFromCheckIns(rows, nowMs = Date.now()) {
  let nEff = 0;
  let weightedBusyness = 0;
  let weightedMaleValue = 0;
  let agreementNumer = 0;

  for (const row of rows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const weight = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);
    const maleValue = crowdFeelToMaleValue(row.crowd_feel);

    nEff += weight;
    weightedBusyness += busynessToScore(row.busyness) * weight;
    weightedMaleValue += maleValue * weight;
    agreementNumer += (Math.abs(maleValue - 50) / 50) * weight;
  }

  const busyness0To100 = nEff > 0 ? Math.round(weightedBusyness / nEff) : null;
  const rawMfRatio = nEff > 0 ? Math.round(weightedMaleValue / nEff) : null;
  const agreement = nEff > 0 ? agreementNumer / nEff : 0;
  const confidence0To1 = nEff > 0 ? (nEff / (nEff + 3)) * agreement : 0;

  return {
    busyness0To100,
    busynessSource: nEff > 0 ? "crowd" : null,
    mfRatio: nEff >= MIN_NEFF_FOR_RATIO ? rawMfRatio : null,
    confidence0To1: Math.max(0, Math.min(1, confidence0To1)),
    sampleSize: Math.round(nEff * 100) / 100,
  };
}

async function recomputeVenueSignal(venueId) {
  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();

  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("id, place_id, last_busyness_refresh")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) throw venueError ?? new Error(`Venue not found: ${venueId}`);

  const { data: rows, error } = await supabase
    .from("check_ins")
    .select("id, venue_id, place_id, busyness, crowd_feel, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const computed = computeSignalFromCheckIns(rows ?? []);
  const hasCrowdRead = computed.busyness0To100 != null;
  const payload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    busyness_0_100: hasCrowdRead ? computed.busyness0To100 : null,
    busyness_source: hasCrowdRead ? computed.busynessSource : null,
    mf_ratio: computed.mfRatio,
    confidence_0_1: computed.confidence0To1,
    sample_size: computed.sampleSize,
    computed_at: new Date().toISOString(),
    last_busyness_refresh: venue.last_busyness_refresh,
  };

  const { data, error: upsertError } = await supabase
    .from("venue_signals")
    .upsert(payload, { onConflict: "venue_id" })
    .select()
    .single();

  if (upsertError) throw upsertError;
  return data;
}

async function getLaunchVenues() {
  const { data, error } = await supabase
    .from("venues")
    .select("id, place_id, name, hidden")
    .eq("zone_id", ZONE_ID)
    .eq("hidden", false)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function summarizeRows(rows) {
  const counts = rows.reduce(
    (acc, row) => {
      acc.busyness[row.busyness] = (acc.busyness[row.busyness] ?? 0) + 1;
      acc.crowdFeel[row.crowd_feel] = (acc.crowdFeel[row.crowd_feel] ?? 0) + 1;
      return acc;
    },
    { busyness: {}, crowdFeel: {} },
  );
  return counts;
}

async function main() {
  const venues = await getLaunchVenues();
  if (!venues.length) {
    throw new Error(`No visible venues found for zone_id=${ZONE_ID}. Seed venues first.`);
  }

  const weekendNight = isWeekendNight();
  const rows = venues.flatMap((venue, index) => buildRowsForVenue(venue, index, weekendNight));
  const summary = summarizeRows(rows);

  console.log(
    `${isDryRun ? "Dry run:" : isRecomputeOnly ? "Recomputing signals for" : "Seeding"} ${rows.length} check-ins across ${venues.length} venues.`
  );
  console.log(`Zone: ${ZONE_ID}`);
  console.log(`Night profile: ${weekendNight ? "Fri/Sat packed/moderate mix" : "weekday dead/moderate mix"}`);
  console.log("Busyness:", JSON.stringify(summary.busyness));
  console.log("Crowd feel:", JSON.stringify(summary.crowdFeel));

  for (const venue of venues) {
    const venueRows = rows.filter((row) => row.venue_id === venue.id);
    const preview = venueRows
      .slice(0, 2)
      .map((row) => `${row.busyness}/${row.crowd_feel}@${row.created_at}`)
      .join(", ");
    console.log(`- ${venue.name}: ${venueRows.length} check-ins (${preview})`);
  }

  if (isDryRun) {
    console.log("Dry run complete. No rows inserted and no venue_signals updated.");
    return;
  }

  if (!isRecomputeOnly) {
    const { error } = await supabase.from("check_ins").insert(rows);
    if (error) throw error;
  }

  for (const venue of venues) {
    await recomputeVenueSignal(venue.id);
  }

  const { count, error: countError } = await supabase
    .from("venue_signals")
    .select("venue_id", { count: "exact", head: true })
    .in(
      "venue_id",
      venues.map((venue) => venue.id),
    )
    .not("mf_ratio", "is", null);

  if (countError) throw countError;

  console.log(
    isRecomputeOnly
      ? `Recomputed venue signals across ${venues.length} venues.`
      : `Seeded ${rows.length} check-ins across ${venues.length} venues.`
  );
  console.log(`${count ?? 0} venues now have mf_ratio populated.`);
}

main().catch((error) => {
  console.error("Failed to seed launch check-ins:", error);
  process.exit(1);
});
