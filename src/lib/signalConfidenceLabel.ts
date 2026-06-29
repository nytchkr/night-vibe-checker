import type { VenueSignal } from "@/types";

type SignalConfidenceInput = Pick<VenueSignal, "busynessSource">;

export function formatSignalConfidenceLabel(signal: SignalConfidenceInput | null | undefined): string {
  if (!signal || signal.busynessSource === "forecast") {
    return "BestTime forecast";
  }

  if (signal.busynessSource === "unavailable") {
    return "No live busyness source available";
  }

  if (signal.busynessSource === "live") {
    return "Live venue data";
  }

  return "Venue busyness data";
}
