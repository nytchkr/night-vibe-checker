export type BusynessLevel = "dead" | "moderate" | "packed";
export type BusynessLabel = "No data yet" | "Quiet" | "Moderate" | "Packed";

export const BUSYNESS_COLORS: Record<BusynessLevel, string> = {
  dead: "#4ADE80",
  moderate: "#FBBF24",
  packed: "#F87171",
};

export type BusynessState = {
  level: BusynessLevel | null;
  label: BusynessLabel;
  color: string;
  rank: number;
};

export function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { level: null, label: "No data yet", color: "#71717A", rank: 0 };
  if (value >= 67) return { level: "packed", label: "Packed", color: BUSYNESS_COLORS.packed, rank: 3 };
  if (value >= 34) return { level: "moderate", label: "Moderate", color: BUSYNESS_COLORS.moderate, rank: 2 };
  return { level: "dead", label: "Quiet", color: BUSYNESS_COLORS.dead, rank: 1 };
}
