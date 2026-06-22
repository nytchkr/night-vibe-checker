import { describe, expect, it } from "vitest";
import { formatSignalConfidenceLabel } from "@/lib/signalConfidenceLabel";

describe("formatSignalConfidenceLabel", () => {
  it("labels forecast signals as BestTime forecast and zero-sample live as venue data", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "forecast", sampleSize: 7 })).toBe("BestTime forecast");
    expect(formatSignalConfidenceLabel({ busynessSource: "live", sampleSize: 0 })).toBe("Live venue data");
    expect(formatSignalConfidenceLabel(null)).toBe("BestTime forecast");
  });

  it("labels unavailable live data", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "unavailable", sampleSize: 0 })).toBe("No live crowd source available");
  });

  it("labels small crowd samples as early data", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "crowd", sampleSize: 1 })).toBe("Early data (1 check-in)");
    expect(formatSignalConfidenceLabel({ busynessSource: "crowd", sampleSize: 4 })).toBe("Early data (4 check-ins)");
  });

  it("labels larger samples as check-in based", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "crowd", sampleSize: 5 })).toBe("Based on 5 check-ins");
  });
});
