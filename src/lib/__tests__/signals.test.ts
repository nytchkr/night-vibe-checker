import { describe, expect, it } from "vitest";
import { computeSignalFromCheckIns } from "@/lib/signals";

const NOW = Date.parse("2026-06-21T03:00:00.000Z");

function row(crowdFeel: "mostly_male" | "mostly_female" | "balanced" | "mixed", ageMinutes: number) {
  return {
    id: `${crowdFeel}-${ageMinutes}`,
    venue_id: "venue-1",
    place_id: "place-1",
    busyness: "moderate" as const,
    crowd_feel: crowdFeel,
    created_at: new Date(NOW - ageMinutes * 60_000).toISOString(),
  };
}

describe("computeSignalFromCheckIns", () => {
  it("computes the weighted M/F ratio from the last two-hour crowd feel spec", () => {
    const signal = computeSignalFromCheckIns(
      [row("mostly_male", 0), row("mostly_male", 0), row("mostly_female", 45)],
      NOW
    );

    expect(signal.mfRatio).toBeCloseTo(80, 5);
    expect(signal.confidence0To1).toBeCloseTo(2.5 / 5.5, 5);
    expect(signal.sampleSize).toBe(3);
  });

  it("keeps mfRatio empty when effective sample weight is below 2", () => {
    const signal = computeSignalFromCheckIns([row("mostly_male", 0)], NOW);

    expect(signal.mfRatio).toBeNull();
    expect(signal.confidence0To1).toBeCloseTo(1 / 4, 5);
    expect(signal.sampleSize).toBe(1);
  });

  it("treats balanced and mixed as neutral male values", () => {
    const signal = computeSignalFromCheckIns([row("balanced", 0), row("mixed", 0)], NOW);

    expect(signal.mfRatio).toBe(50);
    expect(signal.sampleSize).toBe(2);
  });
});
