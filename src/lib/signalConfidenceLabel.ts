import type { VenueSignal } from "@/types";

export function formatSignalConfidenceLabel(signal: Pick<VenueSignal, "busynessSource" | "sampleSize"> | null | undefined): string {
  if (!signal || signal.busynessSource === "forecast") {
    return "BestTime forecast";
  }

  if (signal.busynessSource === "live" && signal.sampleSize <= 0) {
    return "Live venue data";
  }

  if (signal.sampleSize >= 5) {
    return `Based on ${signal.sampleSize} check-ins`;
  }

  return `Early data (${signal.sampleSize} check-in${signal.sampleSize === 1 ? "" : "s"})`;
}
