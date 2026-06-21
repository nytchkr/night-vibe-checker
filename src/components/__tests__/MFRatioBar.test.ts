import { describe, expect, it } from "vitest";
import { getMFRatioPercents } from "@/components/MFRatioBar";

describe("getMFRatioPercents", () => {
  it("converts canonical 0-1 female ratio into male and female percentages", () => {
    expect(getMFRatioPercents(0)).toEqual({ male: 100, female: 0 });
    expect(getMFRatioPercents(0.42)).toEqual({ male: 58, female: 42 });
    expect(getMFRatioPercents(1)).toEqual({ male: 0, female: 100 });
  });

  it("tolerates legacy 0-100 male percentages while signals are migrated", () => {
    expect(getMFRatioPercents(58)).toEqual({ male: 58, female: 42 });
  });

  it("returns null for missing or invalid ratios", () => {
    expect(getMFRatioPercents(null)).toBeNull();
    expect(getMFRatioPercents(undefined)).toBeNull();
    expect(getMFRatioPercents(Number.NaN)).toBeNull();
  });

  it("clamps out-of-range values", () => {
    expect(getMFRatioPercents(-0.2)).toEqual({ male: 100, female: 0 });
    expect(getMFRatioPercents(140)).toEqual({ male: 100, female: 0 });
  });
});
