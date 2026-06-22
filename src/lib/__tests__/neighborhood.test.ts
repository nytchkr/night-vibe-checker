import { describe, expect, it } from "vitest";
import { getNeighborhood } from "@/lib/neighborhood";

describe("getNeighborhood", () => {
  it.each([
    [35.215, -80.86, "South End"],
    [35.225, -80.84, "Uptown"],
    [35.215, -80.82, "Plaza Midwood"],
    [35.25, -80.81, "NoDa"],
    [35.205, -80.86, "Dilworth"],
    [35.165, -80.835, "SouthPark"],
  ])("maps %s, %s to %s", (lat, lng, expected) => {
    expect(getNeighborhood(lat, lng)).toBe(expected);
  });

  it("uses the first matching named zone for overlapping bounds", () => {
    expect(getNeighborhood(35.215, -80.86)).toBe("South End");
  });

  it("falls back to Charlotte outside named zones", () => {
    expect(getNeighborhood(35.19, -80.9)).toBe("Charlotte");
    expect(getNeighborhood(Number.NaN, -80.86)).toBe("Charlotte");
  });
});
