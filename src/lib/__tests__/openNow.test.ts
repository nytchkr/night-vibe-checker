import { describe, expect, it } from "vitest";
import { inferCanonicalOpenNow, inferOpenNow, isOpenNow, isOpenNowFresh, isOpenNowFromGoogleHours } from "@/lib/openNow";

const sampleHours = {
  periods: [
    {
      open: { day: 1, hour: 17, minute: 0 },
      close: { day: 2, hour: 2, minute: 0 },
    },
    {
      open: { day: 5, hour: 16, minute: 30 },
      close: { day: 6, hour: 2, minute: 15 },
    },
  ],
};

describe("isOpenNowFromGoogleHours", () => {
  it("returns true when Charlotte time falls within a same-night Google period", () => {
    expect(isOpenNowFromGoogleHours(sampleHours, { day: 1, hour: 18, minute: 30 })).toBe(true);
  });

  it("returns true for overnight periods after midnight", () => {
    expect(isOpenNowFromGoogleHours(sampleHours, { day: 2, hour: 1, minute: 45 })).toBe(true);
  });

  it("returns false at the close minute for overnight periods", () => {
    expect(isOpenNowFromGoogleHours(sampleHours, { day: 2, hour: 2, minute: 0 })).toBe(false);
  });

  it("returns false when Google periods exist but none match", () => {
    expect(isOpenNowFromGoogleHours(sampleHours, { day: 3, hour: 20, minute: 0 })).toBe(false);
  });

  it("handles periods that cross the end of the week", () => {
    const weekendHours = {
      periods: [
        {
          open: { day: 6, hour: 22, minute: 0 },
          close: { day: 0, hour: 2, minute: 0 },
        },
      ],
    };

    expect(isOpenNowFromGoogleHours(weekendHours, { day: 0, hour: 1, minute: 0 })).toBe(true);
    expect(isOpenNowFromGoogleHours(weekendHours, { day: 0, hour: 3, minute: 0 })).toBe(false);
  });

  it("returns null for missing or malformed Google data", () => {
    expect(isOpenNowFromGoogleHours(null, { day: 1, hour: 18, minute: 0 })).toBeNull();
    expect(isOpenNowFromGoogleHours({ periods: [{ open: { day: 1 } }] }, { day: 1, hour: 18, minute: 0 })).toBeNull();
  });

  it("treats Google periods without close endpoints as always open", () => {
    expect(
      isOpenNowFromGoogleHours(
        { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
        { day: 4, hour: 3, minute: 15 }
      )
    ).toBe(true);
  });
});

describe("isOpenNow", () => {
  it("returns only the explicit Google open_now value", () => {
    expect(isOpenNow({ open_now: true })).toBe(true);
    expect(isOpenNow({ open_now: false })).toBe(false);
    expect(isOpenNow({ openNow: true })).toBe(true);
    expect(isOpenNow(null)).toBeNull();
    expect(isOpenNow({ periods: [] })).toBeNull();
  });
});

describe("inferOpenNow", () => {
  it("uses Google hours before category heuristics", () => {
    expect(inferOpenNow("bar", { day: 1, hour: 18, minute: 0 }, sampleHours)).toBe(true);
  });

  it("returns null instead of guessing when Google hours are unavailable", () => {
    expect(inferOpenNow("bar", { day: 1, hour: 18, minute: 0 }, null)).toBeNull();
    expect(inferOpenNow("restaurant", { day: 1, hour: 12, minute: 0 }, null)).toBeNull();
  });

  it("returns true for current-day 24 hour text when periods are unavailable", () => {
    expect(
      inferOpenNow("bar", { day: 1, hour: 18, minute: 0 }, { weekdayDescriptions: ["Monday: Open 24 hours"] })
    ).toBe(true);
    expect(inferOpenNow("bar", { day: 3, hour: 4, minute: 0 }, ["Open 24 hours"])).toBe(true);
  });
});

describe("inferCanonicalOpenNow", () => {
  const now = new Date("2026-06-22T22:00:00.000-04:00");

  it("uses only the explicit Google open_now field", () => {
    expect(
      inferCanonicalOpenNow({
        category: "bar",
        openingHours: { ...sampleHours, open_now: true },
        refreshedAt: "2026-06-20T21:30:00.000-04:00",
        now,
      })
    ).toBe(true);

    expect(
      inferCanonicalOpenNow({
        openingHours: { ...sampleHours, open_now: false },
      })
    ).toBe(false);
  });

  it("returns null instead of computing from Google periods", () => {
    expect(
      inferCanonicalOpenNow({
        category: "bar",
        openingHours: sampleHours,
        refreshedAt: "2026-06-22T21:30:00.000-04:00",
        now,
      })
    ).toBeNull();
  });

  it("returns null for fresh Places hours without parseable periods", () => {
    expect(
      inferCanonicalOpenNow({
        category: "bar",
        openingHours: { weekdayDescriptions: ["Monday: 5:00 PM - 2:00 AM"] },
        refreshedAt: "2026-06-22T21:30:00.000-04:00",
        now,
      })
    ).toBeNull();
  });

  it("returns null for fresh venues with no hours data instead of closed", () => {
    expect(
      inferCanonicalOpenNow({
        category: "bar",
        openingHours: null,
        refreshedAt: "2026-06-22T21:30:00.000-04:00",
        now,
      })
    ).toBeNull();
  });

  it("returns null when opening hours are missing", () => {
    expect(inferCanonicalOpenNow({})).toBeNull();
  });
});

describe("isOpenNowFresh", () => {
  it("requires a refresh timestamp within 24 hours", () => {
    const now = new Date("2026-06-23T22:00:00.000-04:00");
    expect(isOpenNowFresh("2026-06-22T22:01:00.000-04:00", now)).toBe(true);
    expect(isOpenNowFresh("2026-06-22T21:59:00.000-04:00", now)).toBe(false);
    expect(isOpenNowFresh(null, now)).toBe(false);
  });
});
