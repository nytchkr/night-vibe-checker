const WEEKDAYS_SUNDAY_FIRST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const WEEKDAYS_MONDAY_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type WeekdayName = (typeof WEEKDAYS_SUNDAY_FIRST)[number];

export type VenueWeekHours = {
  day: WeekdayName;
  hours: string;
  closed: boolean;
  available: boolean;
};

export type VenueHoursSummary = {
  hasHours: boolean;
  today: WeekdayName;
  todayStatus: string;
  weekHours: VenueWeekHours[];
};

type GooglePeriodEndpoint = {
  day?: unknown;
  time?: unknown;
  hour?: unknown;
  minute?: unknown;
};

type ParsedTime = {
  display: string;
  minutes: number;
};

type ParsedRange = {
  open: ParsedTime;
  close: ParsedTime;
};

const HOURS_NOT_AVAILABLE = "Hours not available";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\u202f|\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDash(value: string): string {
  return normalizeSpaces(value).replace(/\s*[-–—]\s*/g, " – ");
}

function weekdayFromGoogleDay(day: unknown): WeekdayName | null {
  const index = typeof day === "number" ? day : typeof day === "string" ? Number(day) : NaN;
  if (!Number.isInteger(index) || index < 0 || index > 6) return null;
  return WEEKDAYS_SUNDAY_FIRST[index];
}

export function getVenueHoursDay(hours: string): WeekdayName | null {
  const day = normalizeSpaces(hours).match(/^([^:]+):/)?.[1]?.trim().toLowerCase();
  return WEEKDAYS_SUNDAY_FIRST.find((weekday) => weekday.toLowerCase() === day) ?? null;
}

function stripDayPrefix(hours: string): string {
  const separatorIndex = hours.indexOf(":");
  const maybeDay = separatorIndex >= 0 ? hours.slice(0, separatorIndex).trim().toLowerCase() : "";
  if (WEEKDAYS_SUNDAY_FIRST.some((weekday) => weekday.toLowerCase() === maybeDay)) {
    return hours.slice(separatorIndex + 1);
  }
  return hours;
}

function formatMinutesAsTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function parseEndpointTime(endpoint: GooglePeriodEndpoint): ParsedTime | null {
  if (typeof endpoint.hour === "number") {
    const minute = typeof endpoint.minute === "number" ? endpoint.minute : 0;
    if (endpoint.hour < 0 || endpoint.hour > 23 || minute < 0 || minute > 59) return null;
    const minutes = endpoint.hour * 60 + minute;
    return { display: formatMinutesAsTime(minutes), minutes };
  }

  if (typeof endpoint.time !== "string") return null;
  const match = endpoint.time.match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const minutes = hour * 60 + minute;
  return { display: formatMinutesAsTime(minutes), minutes };
}

function parseDisplayTime(value: string): ParsedTime | null {
  const normalized = normalizeSpaces(value).toUpperCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const period = match[3];
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const hour24 = period === "AM"
    ? hour === 12 ? 0 : hour
    : hour === 12 ? 12 : hour + 12;
  const minutes = hour24 * 60 + minute;
  return { display: formatMinutesAsTime(minutes), minutes };
}

function splitHoursRanges(hoursText: string): string[] {
  return normalizeDash(hoursText)
    .split(/\s*,\s*/)
    .map((range) => range.trim())
    .filter(Boolean);
}

function parseHoursRange(range: string): ParsedRange | null {
  const [open, close] = normalizeDash(range).split(/\s+–\s+/);
  if (!open || !close) return null;
  const parsedOpen = parseDisplayTime(open);
  const parsedClose = parseDisplayTime(close);
  if (!parsedOpen || !parsedClose) return null;
  return { open: parsedOpen, close: parsedClose };
}

export function formatVenueHoursText(hours: string): string {
  const value = normalizeDash(stripDayPrefix(hours));
  if (!value) return HOURS_NOT_AVAILABLE;
  if (/\bclosed\b/i.test(value)) return "Closed";
  if (/open\s*24\s*hours/i.test(value)) return "Open 24 hours";

  const ranges = splitHoursRanges(value).map((range) => {
    const parsed = parseHoursRange(range);
    return parsed ? `${parsed.open.display} – ${parsed.close.display}` : normalizeDash(range);
  });

  return ranges.length > 0 ? ranges.join(", ") : HOURS_NOT_AVAILABLE;
}

function isClosedHours(hoursText: string): boolean {
  return /\bclosed\b/i.test(hoursText);
}

function parseFirstHoursRange(hoursText: string): ParsedRange | null {
  const firstRange = splitHoursRanges(hoursText)[0];
  return firstRange ? parseHoursRange(firstRange) : null;
}

function formatTodayHoursStatus(todayHours: string | undefined, previousHours: string | undefined, now: Date): string {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (previousHours) {
    const previousRange = parseFirstHoursRange(formatVenueHoursText(previousHours));
    if (previousRange && previousRange.close.minutes <= previousRange.open.minutes && nowMinutes < previousRange.close.minutes) {
      return `Open until ${previousRange.close.display}`;
    }
  }

  if (!todayHours) return "Closed";

  const hoursText = formatVenueHoursText(todayHours);
  if (isClosedHours(hoursText)) return "Closed";
  if (/open\s*24\s*hours/i.test(hoursText)) return "Open 24 hours";

  const range = parseFirstHoursRange(hoursText);
  if (!range) return hoursText;

  const closeMinutes = range.close.minutes <= range.open.minutes
    ? range.close.minutes + 24 * 60
    : range.close.minutes;

  if (nowMinutes < range.open.minutes) return `Opens at ${range.open.display}`;
  if (nowMinutes < closeMinutes) return `Open until ${range.close.display}`;
  return "Closed";
}

function formatWeekHours(day: WeekdayName, hoursEntry: string | undefined): VenueWeekHours {
  if (!hoursEntry) {
    return { day, hours: HOURS_NOT_AVAILABLE, closed: false, available: false };
  }

  const hours = formatVenueHoursText(hoursEntry);
  return {
    day,
    hours,
    closed: isClosedHours(hours),
    available: hours !== HOURS_NOT_AVAILABLE,
  };
}

export function summarizeVenueHours(openingHours: string[] | undefined, now = new Date()): VenueHoursSummary {
  const hoursByDay = new Map<WeekdayName, string>();
  for (const entry of openingHours ?? []) {
    const day = getVenueHoursDay(entry);
    if (day) hoursByDay.set(day, entry);
  }

  const hasHours = hoursByDay.size > 0;
  const today = now.toLocaleDateString("en-US", { weekday: "long" }) as WeekdayName;
  const previousDay = WEEKDAYS_SUNDAY_FIRST[(WEEKDAYS_SUNDAY_FIRST.indexOf(today) + WEEKDAYS_SUNDAY_FIRST.length - 1) % WEEKDAYS_SUNDAY_FIRST.length];
  const todayHours = hoursByDay.get(today);
  const previousHours = hoursByDay.get(previousDay);

  return {
    hasHours,
    today,
    todayStatus: hasHours ? formatTodayHoursStatus(todayHours, previousHours, now) : HOURS_NOT_AVAILABLE,
    weekHours: WEEKDAYS_MONDAY_FIRST.map((day) => formatWeekHours(day, hoursByDay.get(day))),
  };
}

function getWeekdayDescriptions(value: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(value.weekdayDescriptions)) return value.weekdayDescriptions;
  if (Array.isArray(value.weekday_descriptions)) return value.weekday_descriptions;
  if (Array.isArray(value.weekday_text)) return value.weekday_text;
  return null;
}

function openingHoursFromPeriods(periods: unknown[]): string[] | undefined {
  const rangesByDay = new Map<WeekdayName, string[]>();

  for (const period of periods) {
    if (!isRecord(period) || !isRecord(period.open)) continue;
    const openDay = weekdayFromGoogleDay(period.open.day);
    const openTime = parseEndpointTime(period.open);
    if (!openDay || !openTime) continue;

    if (!isRecord(period.close)) {
      for (const day of WEEKDAYS_MONDAY_FIRST) {
        rangesByDay.set(day, ["Open 24 hours"]);
      }
      continue;
    }

    const closeTime = parseEndpointTime(period.close);
    if (!closeTime) continue;
    const ranges = rangesByDay.get(openDay) ?? [];
    ranges.push(`${openTime.display} – ${closeTime.display}`);
    rangesByDay.set(openDay, ranges);
  }

  if (rangesByDay.size === 0) return undefined;

  return WEEKDAYS_MONDAY_FIRST.map((day) => {
    const ranges = rangesByDay.get(day);
    return `${day}: ${ranges?.length ? ranges.join(", ") : "Closed"}`;
  });
}

export function mapGoogleOpeningHours(value: unknown): string[] | undefined {
  if (isRecord(value)) {
    const descriptions = getWeekdayDescriptions(value);
    if (descriptions) {
      const hours = descriptions.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      return hours.length ? hours : undefined;
    }

    if (Array.isArray(value.periods)) return openingHoursFromPeriods(value.periods);
  }

  if (!Array.isArray(value)) return undefined;
  const hours = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return hours.length ? hours : undefined;
}
