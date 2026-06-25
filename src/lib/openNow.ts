import { supabaseAdmin } from "@/lib/supabase";

const TIME_ZONE = "America/New_York";
const UPDATE_BATCH_SIZE = 100;
const OPEN_NOW_FRESH_MS = 24 * 60 * 60 * 1000;

type CharlotteTime = {
  day: number;
  hour: number;
  minute: number;
};

type VenueOpenNowRow = {
  id: string;
  category: string | null;
  opening_hours: unknown;
  [key: string]: unknown;
};

type CanonicalOpenNowInput = {
  category?: string | null;
  openingHours?: unknown;
  refreshedAt?: unknown;
  now?: Date;
};

type GoogleHoursEndpoint = {
  day?: unknown;
  hour?: unknown;
  minute?: unknown;
};

type GoogleHoursPeriod = {
  open?: GoogleHoursEndpoint;
  close?: GoogleHoursEndpoint;
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export function getCharlotteTimeParts(date = new Date()): CharlotteTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = weekdays.indexOf(weekday ?? "");

  if (day === -1 || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error("Could not determine current Charlotte weekday/hour.");
  }

  return { day, hour, minute };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseGoogleEndpoint(endpoint: GoogleHoursEndpoint | undefined): number | null {
  if (!endpoint) return null;

  const day = Number(endpoint.day);
  const hour = Number(endpoint.hour);
  const minute = Number(endpoint.minute ?? 0);

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    day < 0 ||
    day > 6 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return day * MINUTES_PER_DAY + hour * 60 + minute;
}

function isMinuteWithinPeriod(currentMinute: number, openMinute: number, closeMinute: number) {
  let adjustedClose = closeMinute;
  if (adjustedClose <= openMinute) adjustedClose += MINUTES_PER_WEEK;

  return (
    (currentMinute >= openMinute && currentMinute < adjustedClose) ||
    (currentMinute + MINUTES_PER_WEEK >= openMinute && currentMinute + MINUTES_PER_WEEK < adjustedClose)
  );
}

export function isOpenNowFromGoogleHours(openingHours: unknown, charlotteTime: CharlotteTime): boolean | null {
  if (!isRecord(openingHours)) return null;

  const rawPeriods = openingHours.periods;
  if (!Array.isArray(rawPeriods)) return null;

  const currentMinute = charlotteTime.day * MINUTES_PER_DAY + charlotteTime.hour * 60 + charlotteTime.minute;
  let parsedAnyPeriod = false;

  for (const rawPeriod of rawPeriods) {
    if (!isRecord(rawPeriod)) continue;

    const period = rawPeriod as GoogleHoursPeriod;
    const openMinute = parseGoogleEndpoint(period.open);
    const closeMinute = parseGoogleEndpoint(period.close);
    if (openMinute == null || closeMinute == null) continue;

    parsedAnyPeriod = true;
    if (isMinuteWithinPeriod(currentMinute, openMinute, closeMinute)) return true;
  }

  return parsedAnyPeriod ? false : null;
}

export function isOpenNow(opening_hours: any): boolean | null {
  return opening_hours?.open_now ?? null;
}

export function inferOpenNow(category: string | null, charlotteTime: CharlotteTime, openingHours?: unknown): boolean | null {
  void category;
  if (openingHours != null) {
    const googleOpenNow = isOpenNowFromGoogleHours(openingHours, charlotteTime);
    if (googleOpenNow != null) return googleOpenNow;
  }

  return null;
}

function parseRefreshTime(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isOpenNowFresh(refreshedAt: unknown, now = new Date()): boolean {
  const refreshedTime = parseRefreshTime(refreshedAt);
  if (refreshedTime == null) return false;
  return now.getTime() - refreshedTime <= OPEN_NOW_FRESH_MS;
}

export function inferCanonicalOpenNow({
  category = null,
  openingHours,
  refreshedAt,
  now = new Date(),
}: CanonicalOpenNowInput): boolean | null {
  if (!isOpenNowFresh(refreshedAt, now)) return null;

  const charlotteTime = getCharlotteTimeParts(now);
  const inferredOpenNow = inferOpenNow(category, charlotteTime, openingHours);
  if (inferredOpenNow != null) return inferredOpenNow;

  return null;
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
    open_now: inferOpenNow(venue.category, charlotteTime, venue.opening_hours),
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
