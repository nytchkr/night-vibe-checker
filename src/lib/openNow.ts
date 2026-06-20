import { supabaseAdmin } from "@/lib/supabase";

const TIME_ZONE = "America/New_York";
const BAR_DAYS = new Set([0, 4, 5, 6]);
const WEEKEND_BAR_DAYS = new Set([5, 6]);
const UPDATE_BATCH_SIZE = 100;

type CharlotteTime = {
  day: number;
  hour: number;
};

type VenueOpenNowRow = {
  id: string;
  category: string | null;
  [key: string]: unknown;
};

export function getCharlotteTimeParts(date = new Date()): CharlotteTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = weekdays.indexOf(weekday ?? "");

  if (day === -1 || Number.isNaN(hour)) {
    throw new Error("Could not determine current Charlotte weekday/hour.");
  }

  return { day, hour };
}

function previousDay(day: number) {
  return (day + 6) % 7;
}

function isBarCategory(category: string | null) {
  const normalized = String(category ?? "").toLowerCase();
  return (
    normalized.includes("bar") ||
    normalized.includes("night_club") ||
    normalized.includes("nightclub") ||
    normalized.includes("night club")
  );
}

function isRestaurantCategory(category: string | null) {
  return String(category ?? "").toLowerCase().includes("restaurant");
}

function isBarOpen({ day, hour }: CharlotteTime) {
  if (hour < 2) {
    return BAR_DAYS.has(previousDay(day));
  }

  if (!BAR_DAYS.has(day)) {
    return false;
  }

  const openingHour = WEEKEND_BAR_DAYS.has(day) ? 16 : 17;
  return hour >= openingHour;
}

export function isOpenNow(category: string | null, charlotteTime: CharlotteTime) {
  if (isBarCategory(category)) {
    return isBarOpen(charlotteTime);
  }

  if (isRestaurantCategory(category)) {
    return charlotteTime.hour >= 11 && charlotteTime.hour < 23;
  }

  return charlotteTime.hour >= 10 && charlotteTime.hour < 22;
}

export async function refreshOpenNow() {
  const { data: venues, error } = await supabaseAdmin
    .from("venues")
    .select("*")
    .eq("hidden", false)
    .order("id", { ascending: true });

  if (error) throw error;

  const charlotteTime = getCharlotteTimeParts();
  const updates = ((venues ?? []) as VenueOpenNowRow[]).map((venue) => ({
    ...venue,
    open_now: isOpenNow(venue.category, charlotteTime),
  }));

  for (let index = 0; index < updates.length; index += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(index, index + UPDATE_BATCH_SIZE);
    const { error: updateError } = await supabaseAdmin.from("venues").upsert(batch, {
      onConflict: "id",
    });

    if (updateError) throw updateError;
  }

  return { updated: updates.length };
}
