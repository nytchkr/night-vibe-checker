import { describe, expect, it } from "vitest";
import { busynessLabel, busynessScoreForStorage } from "@/lib/besttime";

describe("BestTime busyness mapping", () => {
  it("maps raw 0-100 BestTime scores to storage buckets", () => {
    expect(busynessLabel(0)).toBe("dead");
    expect(busynessLabel(33)).toBe("dead");
    expect(busynessScoreForStorage(0)).toBe(16);
    expect(busynessScoreForStorage(33)).toBe(16);

    expect(busynessLabel(34)).toBe("moderate");
    expect(busynessLabel(66)).toBe("moderate");
    expect(busynessScoreForStorage(34)).toBe(50);
    expect(busynessScoreForStorage(66)).toBe(50);

    expect(busynessLabel(67)).toBe("packed");
    expect(busynessLabel(100)).toBe("packed");
    expect(busynessScoreForStorage(67)).toBe(84);
    expect(busynessScoreForStorage(100)).toBe(84);
  });
});
