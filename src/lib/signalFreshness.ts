import type { VenueSignal } from "@/types";

const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type SignalFreshnessInput =
  | (Pick<VenueSignal, "busynessSource"> & { computedAt: string | null | undefined })
  | null
  | undefined;

function getAgeMs(computedAt: string | null | undefined): number | null {
  if (!computedAt) return null;

  const timestamp = Date.parse(computedAt);
  if (!Number.isFinite(timestamp)) return null;

  return Math.max(0, Date.now() - timestamp);
}

export function getSignalLabel(signal: SignalFreshnessInput): "live" | "forecast" | null {
  if (!signal?.busynessSource) return null;

  if (signal.busynessSource === "forecast") return "forecast";

  const ageMs = getAgeMs(signal.computedAt);
  if (ageMs !== null && ageMs < LIVE_MAX_AGE_MS) return "live";

  return "forecast";
}

export function formatSignalAge(computedAt: string | null): string | null {
  const ageMs = getAgeMs(computedAt);
  if (ageMs === null) return null;

  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 60) return `${minutes}m ago`;

  return `${Math.floor(minutes / 60)}h ago`;
}
