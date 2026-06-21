import type { VenueSignal } from "@/types";

export function formatSignalConfidenceLabel(signal: Pick<VenueSignal, "busynessSource" | "sampleSize"> | null | undefined): string {
  if (!signal || signal.busynessSource === "forecast" || signal.sampleSize <= 0) {
    return "BestTime forecast";
  }

  if (signal.sampleSize >= 5) {
    return `Based on ${signal.sampleSize} check-ins`;
  }

  return `Early data (${signal.sampleSize} check-in${signal.sampleSize === 1 ? "" : "s"})`;
}
