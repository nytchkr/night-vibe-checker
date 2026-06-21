import { describe, expect, it } from "vitest";
import { computeSignalFromCheckIns } from "@/lib/signals";

const NOW = Date.parse("2026-06-21T03:00:00.000Z");

function row(
  crowdFeel: "mostly_male" | "mostly_female" | "balanced" | "mixed",
  ageMinutes: number,
  reporterGender: "male" | "female" | null = null,
  genderSelfReport: "m" | "f" | "nb" | null = null,
) {
  return {
    id: `${crowdFeel}-${ageMinutes}`,
    venue_id: "venue-1",
    place_id: "place-1",
    busyness: "moderate" as const,
    crowd_feel: crowdFeel,
    reporter_gender: reporterGender,
    gender_self_report: genderSelfReport,
    created_at: new Date(NOW - ageMinutes * 60_000).toISOString(),
  };
}

describe("computeSignalFromCheckIns", () => {
  it("computes the M/F ratio from recent reporter gender counts", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_female", 0, "male"),
        row("mostly_female", 0, "male"),
        row("mostly_male", 45, "female"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBeCloseTo((2 / 3) * 100, 5);
    expect(signal.confidence0To1).toBeCloseTo(3 / 6, 5);
    expect(signal.sampleSize).toBe(3);
  });

  it("keeps mfRatio empty when fewer than 2 recent gendered reports exist", () => {
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

  it("uses gender self-report before profile gender for the M/F ratio", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, "female", "m"),
        row("balanced", 0, "female", "m"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBe(100);
    expect(signal.sampleSize).toBe(2);
  });

  it("counts non-binary self-reports in the recent denominator without adding male count", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, "male", "m"),
        row("balanced", 0, "male", "nb"),
        row("balanced", 0, "female", "f"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBeCloseTo((1 / 3) * 100, 5);
    expect(signal.confidence0To1).toBeCloseTo(3 / 6, 5);
    expect(signal.sampleSize).toBe(3);
  });

  it("ignores check-ins older than 4 hours", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, "female"),
        row("balanced", 0, "female"),
        row("balanced", 0, "male"),
        row("balanced", 241, "male"),
        row("balanced", 300, "male"),
      ],
      NOW
    );

    expect(signal.sampleSize).toBe(3);
    expect(signal.mfRatio).toBeCloseTo(100 / 3, 5);
    expect(signal.confidence0To1).toBeCloseTo(3 / 6, 5);
  });
});
