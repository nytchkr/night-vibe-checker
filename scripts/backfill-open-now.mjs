#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const TIME_ZONE = "America/New_York";
const BAR_DAYS = new Set([0, 4, 5, 6]);
const WEEKEND_BAR_DAYS = new Set([5, 6]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with .env.local loaded.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function getCharlotteTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = weekdays.indexOf(weekday);

  if (day === -1 || Number.isNaN(hour)) {
    throw new Error("Could not determine current Charlotte weekday/hour.");
  }

  return { day, hour };
}

function previousDay(day) {
  return (day + 6) % 7;
}

function isBarCategory(category) {
  const normalized = String(category ?? "").toLowerCase();
  return (
    normalized.includes("bar") ||
    normalized.includes("night_club") ||
    normalized.includes("nightclub") ||
    normalized.includes("night club")
  );
}

function isRestaurantCategory(category) {
  return String(category ?? "").toLowerCase().includes("restaurant");
}

function isBarOpen({ day, hour }) {
  if (hour < 2) {
    return BAR_DAYS.has(previousDay(day));
  }

  if (!BAR_DAYS.has(day)) {
    return false;
  }

  const openingHour = WEEKEND_BAR_DAYS.has(day) ? 16 : 17;
  return hour >= openingHour;
}

function isOpenNow(category, charlotteTime) {
  if (isBarCategory(category)) {
    return isBarOpen(charlotteTime);
  }

  if (isRestaurantCategory(category)) {
    return charlotteTime.hour >= 11 && charlotteTime.hour < 23;
  }

  return charlotteTime.hour >= 10 && charlotteTime.hour < 22;
}

const { data: venues, error: fetchError } = await supabase
  .from("venues")
  .select("*")
  .order("id", { ascending: true });

if (fetchError) {
  console.error("Failed to fetch venues:", fetchError);
  process.exit(1);
}

const charlotteTime = getCharlotteTimeParts();
const updates = (venues ?? []).map((venue) => ({
  ...venue,
  open_now: isOpenNow(venue.category, charlotteTime),
}));

if (updates.length > 0) {
  const { error: updateError } = await supabase.from("venues").upsert(updates, {
    onConflict: "id",
  });

  if (updateError) {
    console.error("Failed to update venue open_now values:", updateError);
    process.exit(1);
  }
}

const openCount = updates.filter((venue) => venue.open_now).length;
const closedCount = updates.length - openCount;

console.log(`Set open_now=true for ${openCount} venues, false for ${closedCount}`);
