import { describe, expect, it } from "vitest";
import { isOpenNow, isOpenNowFromGoogleHours } from "@/lib/openNow";

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
});

describe("isOpenNow", () => {
  it("uses Google hours before category heuristics", () => {
    expect(isOpenNow("bar", { day: 1, hour: 18, minute: 0 }, sampleHours)).toBe(true);
  });

  it("falls back to the category heuristic when Google hours are unavailable", () => {
    expect(isOpenNow("bar", { day: 1, hour: 18, minute: 0 }, null)).toBe(false);
    expect(isOpenNow("restaurant", { day: 1, hour: 12, minute: 0 }, null)).toBe(true);
  });
});

