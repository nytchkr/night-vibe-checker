import { describe, expect, it, vi } from "vitest";
import { computeMfRatioFromCheckIns } from "@/lib/mfRatio";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {},
}));

const NOW = Date.parse("2026-06-28T04:00:00.000Z");

describe("computeMfRatioFromCheckIns", () => {
  it("computes male percentage from only last-24h gendered check-ins", () => {
    const signal = computeMfRatioFromCheckIns(
      [
        { gender_self_report: "m", created_at: "2026-06-28T03:55:00.000Z" },
        { gender_self_report: "m", created_at: "2026-06-28T03:50:00.000Z" },
        { gender_self_report: "f", created_at: "2026-06-28T03:45:00.000Z" },
        { reporter_gender: "male", created_at: "2026-06-28T03:40:00.000Z" },
        { gender: "F", created_at: "2026-06-28T03:35:00.000Z" },
        { gender: "M", created_at: "2026-06-26T03:35:00.000Z" },
        { gender: "prefer_not", created_at: "2026-06-28T03:30:00.000Z" },
      ],
      NOW
    );

    expect(signal.sampleSize).toBe(5);
    expect(signal.mfRatio).toBe(60);
  });

  it("returns null below the minimum gendered sample size", () => {
    const signal = computeMfRatioFromCheckIns(
      [
        { gender_self_report: "m", created_at: "2026-06-28T03:55:00.000Z" },
        { gender_self_report: "f", created_at: "2026-06-28T03:50:00.000Z" },
        { reporter_gender: "female", created_at: "2026-06-28T03:45:00.000Z" },
        { gender: "M", created_at: "2026-06-28T03:40:00.000Z" },
      ],
      NOW
    );

    expect(signal.sampleSize).toBe(4);
    expect(signal.mfRatio).toBeNull();
  });
});
