import { describe, expect, it } from "vitest";
import { formatRewardMessages } from "@/lib/rewardMessages";

describe("formatRewardMessages", () => {
  it("formats the floating points badge and toast copy", () => {
    expect(formatRewardMessages({ pointsAwarded: 10, events: ["checkin", "first_report"] })).toEqual({
      pointsBadge: "+10 pts",
      streakBadge: null,
      toast: "+10 pts · first report tonight +5",
    });
  });

  it("formats a streak badge from the returned streak count", () => {
    expect(formatRewardMessages({ pointsAwarded: 25, events: ["checkin", "streak"], streakCount: 4 })).toEqual({
      pointsBadge: "+25 pts",
      streakBadge: "Day 4 streak 🔥",
      toast: "+25 pts · streak +20",
    });
  });

  it("falls back to the three-day streak event label when no count is returned", () => {
    expect(formatRewardMessages({ pointsAwarded: 20, events: ["streak"] }).streakBadge).toBe("Day 3 streak 🔥");
  });

  it("rounds streak points and keeps streak messaging at a minimum three-day badge", () => {
    expect(formatRewardMessages({ pointsAwarded: 19.6, events: ["streak"], streakCount: 2 })).toEqual({
      pointsBadge: "+20 pts",
      streakBadge: "Day 3 streak 🔥",
      toast: "+20 pts · streak +20",
    });
  });

  it("formats first-time reward copy even when no base points are awarded", () => {
    expect(formatRewardMessages({ pointsAwarded: null, events: ["first_report"] })).toEqual({
      pointsBadge: null,
      streakBadge: null,
      toast: "first report tonight +5",
    });
  });

  it("returns the neutral check-in message when no points are awarded", () => {
    expect(formatRewardMessages({ pointsAwarded: 0, events: [] })).toEqual({
      pointsBadge: null,
      streakBadge: null,
      toast: "Check-in recorded!",
    });
  });

  it("ignores zero and negative point values while preserving positive event messages", () => {
    expect(formatRewardMessages({ pointsAwarded: -5, events: ["streak"], streakCount: 5 })).toEqual({
      pointsBadge: null,
      streakBadge: "Day 5 streak 🔥",
      toast: "streak +20",
    });
  });
});
