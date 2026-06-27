import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSignalAge, formatSignalFreshness, getSignalLabel } from "@/lib/signalFreshness";

const now = new Date("2026-06-21T12:00:00.000Z");

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

describe("signal freshness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps recent live and crowd signals labeled live", () => {
    expect(getSignalLabel({ busynessSource: "live", computedAt: minutesAgo(25) })).toBe("live");
    expect(getSignalLabel({ busynessSource: "crowd", computedAt: minutesAgo(45) })).toBe("live");
  });

  it("demotes stale live signals to forecast", () => {
    expect(getSignalLabel({ busynessSource: "live", computedAt: minutesAgo(121) })).toBe("forecast");
  });

  it("keeps forecast signals forecast and empty signals empty", () => {
    expect(getSignalLabel({ busynessSource: "forecast", computedAt: minutesAgo(10) })).toBe("forecast");
    expect(getSignalLabel(null)).toBeNull();
    expect(getSignalLabel({ busynessSource: null, computedAt: minutesAgo(10) })).toBeNull();
    expect(getSignalLabel({ busynessSource: "unavailable", computedAt: minutesAgo(10) })).toBeNull();
  });

  it("formats signal age in minutes and hours", () => {
    expect(formatSignalAge(minutesAgo(8))).toBe("8m ago");
    expect(formatSignalAge(minutesAgo(125))).toBe("2h ago");
    expect(formatSignalAge(null)).toBeNull();
    expect(formatSignalAge("not-a-date")).toBeNull();
  });

  it("formats venue signal freshness for cards", () => {
    expect(formatSignalFreshness(minutesAgo(8))).toEqual({ label: "Updated 8 min ago", stale: false });
    expect(formatSignalFreshness(minutesAgo(125))).toEqual({ label: "Updated today", stale: false });
    expect(formatSignalFreshness(minutesAgo(24 * 60 + 1))).toEqual({ label: "Data may be outdated", stale: true });
    expect(formatSignalFreshness(null)).toBeNull();
    expect(formatSignalFreshness("not-a-date")).toBeNull();
  });

  it("formats just-updated venue signals as fresh", () => {
    expect(formatSignalAge(now.toISOString())).toBe("0m ago");
    expect(formatSignalFreshness(now.toISOString())).toEqual({ label: "Updated 0 min ago", stale: false });
  });

  it("marks signals older than 24 hours stale", () => {
    expect(formatSignalFreshness(minutesAgo(25 * 60))).toEqual({ label: "Data may be outdated", stale: true });
  });

  it("returns no freshness UI when signal data is absent", () => {
    expect(formatSignalFreshness(undefined)).toBeNull();
    expect(formatSignalFreshness(null)).toBeNull();
    expect(getSignalLabel(undefined)).toBeNull();
  });
});
