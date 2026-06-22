import { describe, expect, it } from "vitest";
import {
  buildBestTimePrediction,
  busynessLabel,
  busynessScoreForStorage,
  isBestTimeForecastUnavailable,
} from "@/lib/besttime";

describe("BestTime busyness mapping", () => {
  it("keeps raw 0-100 BestTime scores for storage", () => {
    expect(busynessLabel(0)).toBe("dead");
    expect(busynessLabel(33)).toBe("dead");
    expect(busynessScoreForStorage(0)).toBe(0);
    expect(busynessScoreForStorage(33.4)).toBe(33);

    expect(busynessLabel(34)).toBe("moderate");
    expect(busynessLabel(66)).toBe("moderate");
    expect(busynessScoreForStorage(34.5)).toBe(35);
    expect(busynessScoreForStorage(66)).toBe(66);

    expect(busynessLabel(67)).toBe("packed");
    expect(busynessLabel(100)).toBe("packed");
    expect(busynessScoreForStorage(67)).toBe(67);
    expect(busynessScoreForStorage(100)).toBe(100);
    expect(busynessScoreForStorage(-10)).toBe(0);
    expect(busynessScoreForStorage(120)).toBe(100);
  });

  it("recognizes BestTime low-volume forecast failures", () => {
    expect(isBestTimeForecastUnavailable("BestTime register failed: could not forecast venue")).toBe(true);
    expect(isBestTimeForecastUnavailable("Venue is too new or not enough visitor volume")).toBe(true);
    expect(isBestTimeForecastUnavailable("BestTime live HTTP 500")).toBe(false);
  });

  it("builds a prediction from hourly BestTime forecast data", () => {
    const prediction = buildBestTimePrediction(
      {
        venueId: "besttime-venue-1",
        dayInt: 4,
        updatedOn: "2026-06-22T20:00:00.000Z",
        hours: [
          { hour: 20, busyness: 30 },
          { hour: 21, busyness: 50 },
          { hour: 22, busyness: 78 },
          { hour: 23, busyness: 92 },
        ],
      },
      21
    );

    expect(prediction).toEqual({
      peakHour: 23,
      peakBusyness: 92,
      bestArrivalHour: 22,
      crowdTrend: "rising",
      vibeLabel: "Peak Hours",
    });
  });

  it("returns null when BestTime has no hourly forecast data", () => {
    expect(buildBestTimePrediction({ venueId: "missing", dayInt: null, updatedOn: null, hours: [] })).toBeNull();
  });
});
