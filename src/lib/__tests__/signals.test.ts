import { describe, expect, it } from "vitest";
import { computeSignalFromCheckIns } from "@/lib/signals";

const NOW = Date.parse("2026-06-21T03:00:00.000Z");

function row(
  crowdFeel: "mostly_male" | "mostly_female" | "balanced" | "mixed",
  ageMinutes: number,
  reporterGender: "male" | "female" | null = null,
) {
  return {
    id: `${crowdFeel}-${ageMinutes}`,
    venue_id: "venue-1",
    place_id: "place-1",
    busyness: "moderate" as const,
    crowd_feel: crowdFeel,
    reporter_gender: reporterGender,
    created_at: new Date(NOW - ageMinutes * 60_000).toISOString(),
  };
}

describe("computeSignalFromCheckIns", () => {
  it("computes the weighted M/F ratio from reporter gender", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_female", 0, "male"),
        row("mostly_female", 0, "male"),
        row("mostly_male", 45, "female"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBeCloseTo(80, 5);
    expect(signal.confidence0To1).toBeCloseTo(2.5 / 5.5, 5);
    expect(signal.sampleSize).toBe(3);
  });

  it("keeps mfRatio empty when effective sample weight is below 2", () => {
    const signal = computeSignalFromCheckIns([row("mostly_male", 0, "male")], NOW);

    expect(signal.mfRatio).toBeNull();
    expect(signal.confidence0To1).toBeCloseTo(1 / 4, 5);
    expect(signal.sampleSize).toBe(1);
  });

  it("ignores crowd feel and undisclosed reporters for M/F ratio", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_male", 0, null),
        row("mostly_female", 0, "male"),
        row("mostly_female", 0, "female"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBe(50);
    expect(signal.sampleSize).toBe(3);
  });
});
