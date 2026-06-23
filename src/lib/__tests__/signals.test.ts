import { describe, expect, it } from "vitest";
import { computeSignalFromCheckIns } from "@/lib/signals";

const NOW = Date.parse("2026-06-21T03:00:00.000Z");

function row(
  crowdFeel: "mostly_male" | "mostly_female" | "balanced" | "mixed",
  ageMinutes: number,
  reporterGender: "male" | "female" | null = null,
  genderSelfReport: "m" | "f" | "nb" | null = null,
  gender: "M" | "F" | "prefer_not" | null = null,
) {
  return {
    id: `${crowdFeel}-${ageMinutes}`,
    venue_id: "venue-1",
    place_id: "place-1",
    busyness: "moderate" as const,
    crowd_feel: crowdFeel,
    gender,
    reporter_gender: reporterGender,
    gender_self_report: genderSelfReport,
    created_at: new Date(NOW - ageMinutes * 60_000).toISOString(),
  };
}

describe("computeSignalFromCheckIns", () => {
  it("computes the M/F ratio from 7-day M/F check-in counts", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_female", 0, null, null, "M"),
        row("mostly_female", 90, null, null, "M"),
        row("mostly_female", 241, null, null, "M"),
        row("mostly_male", 1_000, null, null, "F"),
        row("mostly_male", 9_000, null, null, "F"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBeCloseTo((3 / 5) * 100, 5);
    expect(signal.confidence0To1).toBeCloseTo(5 / 8, 5);
    expect(signal.sampleSize).toBe(5);
    expect(signal.busyness0To100).toBe(50);
  });

  it("keeps mfRatio empty when fewer than 5 M/F reports exist", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_male", 0, null, null, "M"),
        row("mostly_male", 0, null, null, "M"),
        row("mostly_female", 0, null, null, "F"),
        row("mostly_female", 0, null, null, "F"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBeNull();
    expect(signal.confidence0To1).toBeCloseTo(4 / 7, 5);
    expect(signal.sampleSize).toBe(4);
  });

  it("ignores crowd feel, non-binary, and prefer-not reports for M/F ratio", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("mostly_male", 0, null, null, "prefer_not"),
        row("mostly_male", 0, null, "nb"),
        row("mostly_female", 0, null, null, "M"),
        row("mostly_female", 0, null, null, "M"),
        row("mostly_female", 0, null, null, "M"),
        row("mostly_female", 0, null, null, "F"),
        row("mostly_female", 0, null, null, "F"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBe(60);
    expect(signal.sampleSize).toBe(5);
  });

  it("uses canonical gender before legacy profile gender for the M/F ratio", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, "female", "f", "M"),
        row("balanced", 0, "female", "f", "M"),
        row("balanced", 0, "female", "f", "M"),
        row("balanced", 0, "female", "f", "M"),
        row("balanced", 0, "male", "m", "F"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBe(80);
    expect(signal.sampleSize).toBe(5);
  });

  it("uses legacy self-report before profile gender when canonical gender is absent", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, "female", "m"),
        row("balanced", 0, "female", "m"),
        row("balanced", 0, "female", "m"),
        row("balanced", 0, "male", "f"),
        row("balanced", 0, "male", "f"),
      ],
      NOW
    );

    expect(signal.mfRatio).toBe(60);
    expect(signal.confidence0To1).toBeCloseTo(5 / 8, 5);
    expect(signal.sampleSize).toBe(5);
  });

  it("keeps 7-day M/F reports but ignores old rows for busyness", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, null, null, "F"),
        row("balanced", 0, null, null, "F"),
        row("balanced", 241, null, null, "M"),
        row("balanced", 300, null, null, "M"),
        row("balanced", 9_000, null, null, "M"),
        row("balanced", 10_000, null, null, "M"),
      ],
      NOW
    );

    expect(signal.sampleSize).toBe(6);
    expect(signal.mfRatio).toBeCloseTo((4 / 6) * 100, 5);
    expect(signal.confidence0To1).toBeCloseTo(6 / 9, 5);
    expect(signal.busyness0To100).toBe(50);
  });

  it("ignores M/F check-ins older than 7 days", () => {
    const signal = computeSignalFromCheckIns(
      [
        row("balanced", 0, null, null, "F"),
        row("balanced", 0, null, null, "F"),
        row("balanced", 0, null, null, "M"),
        row("balanced", 0, null, null, "M"),
        row("balanced", 10_081, null, null, "M"),
      ],
      NOW
    );

    expect(signal.sampleSize).toBe(4);
    expect(signal.mfRatio).toBeNull();
  });
});
