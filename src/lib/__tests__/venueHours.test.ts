import { describe, expect, it } from "vitest";
import { formatVenueHoursText, mapGoogleOpeningHours, summarizeVenueHours } from "@/lib/venueHours";

describe("formatVenueHoursText", () => {
  it("formats display ranges in en-US 12-hour time with an en dash", () => {
    expect(formatVenueHoursText("Monday: 9 AM - 2 AM")).toBe("9:00 AM – 2:00 AM");
    expect(formatVenueHoursText("Tuesday: 4:30 pm – 11:15 pm")).toBe("4:30 PM – 11:15 PM");
  });
});

describe("summarizeVenueHours", () => {
  const weeklyHours = [
    "Sunday: Closed",
    "Monday: 9:00 AM - 2:00 AM",
    "Tuesday: 9:00 AM - 2:00 AM",
    "Wednesday: 9:00 AM - 2:00 AM",
    "Thursday: 9:00 AM - 2:00 AM",
    "Friday: 10:00 PM - 3:00 AM",
    "Saturday: 10:00 PM - 3:00 AM",
  ];

  it("returns a full Monday-through-Sunday weekly schedule", () => {
    const summary = summarizeVenueHours(weeklyHours, new Date("2026-06-22T12:00:00"));

    expect(summary.hasHours).toBe(true);
    expect(summary.weekHours.map((row) => row.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(summary.weekHours[0]).toMatchObject({ day: "Monday", hours: "9:00 AM – 2:00 AM", available: true });
  });

  it("marks today's row and reports current-day status", () => {
    const summary = summarizeVenueHours(weeklyHours, new Date("2026-06-22T11:00:00"));

    expect(summary.today).toBe("Monday");
    expect(summary.todayStatus).toBe("Open until 2:00 AM");
  });

  it("handles venues open past midnight from the previous day's hours", () => {
    const summary = summarizeVenueHours(weeklyHours, new Date("2026-06-27T01:30:00"));

    expect(summary.today).toBe("Saturday");
    expect(summary.todayStatus).toBe("Open until 3:00 AM");
  });

  it("shows missing data gracefully", () => {
    const summary = summarizeVenueHours(undefined, new Date("2026-06-22T12:00:00"));

    expect(summary.hasHours).toBe(false);
    expect(summary.todayStatus).toBe("Hours not available");
    expect(summary.weekHours.every((row) => row.hours === "Hours not available")).toBe(true);
  });
});

describe("mapGoogleOpeningHours", () => {
  it("maps Google Places periods into weekly descriptions with overnight closes", () => {
    const hours = mapGoogleOpeningHours({
      periods: [
        {
          open: { day: 5, time: "2200" },
          close: { day: 6, time: "0300" },
        },
      ],
    });

    expect(hours).toEqual([
      "Monday: Closed",
      "Tuesday: Closed",
      "Wednesday: Closed",
      "Thursday: Closed",
      "Friday: 10:00 PM – 3:00 AM",
      "Saturday: Closed",
      "Sunday: Closed",
    ]);
  });
});
