import { describe, expect, it } from "vitest";
import { formatSignalConfidenceLabel } from "@/lib/signalConfidenceLabel";

describe("formatSignalConfidenceLabel", () => {
  it("labels forecast signals as BestTime forecast and zero-sample live as venue data", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "forecast" })).toBe("BestTime forecast");
    expect(formatSignalConfidenceLabel({ busynessSource: "live" })).toBe("Live venue data");
    expect(formatSignalConfidenceLabel(null)).toBe("BestTime forecast");
  });

  it("labels unavailable live data", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "unavailable" })).toBe("No live busyness source available");
  });

  it("uses neutral copy for legacy crowd source values", () => {
    expect(formatSignalConfidenceLabel({ busynessSource: "crowd" })).toBe("Venue busyness data");
  });
});
