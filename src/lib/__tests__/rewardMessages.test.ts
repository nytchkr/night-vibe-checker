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

  it("returns the neutral check-in message when no points are awarded", () => {
    expect(formatRewardMessages({ pointsAwarded: 0, events: [] })).toEqual({
      pointsBadge: null,
      streakBadge: null,
      toast: "Check-in recorded!",
    });
  });
});
