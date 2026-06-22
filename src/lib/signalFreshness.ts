import type { VenueSignal } from "@/types";

const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type SignalFreshnessInput =
  | (Pick<VenueSignal, "busynessSource"> & { computedAt: string | null | undefined })
  | null
  | undefined;

function getAgeMs(timestampValue: string | null | undefined): number | null {
  if (!timestampValue) return null;

  const timestamp = Date.parse(timestampValue);
  if (!Number.isFinite(timestamp)) return null;

  return Math.max(0, Date.now() - timestamp);
}

export function getSignalLabel(signal: SignalFreshnessInput): "live" | "forecast" | null {
  if (!signal?.busynessSource) return null;

  if (signal.busynessSource === "unavailable") return null;

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

export function formatSignalFreshness(updatedAt: string | null | undefined): { label: string; stale: boolean } | null {
  const ageMs = getAgeMs(updatedAt);
  if (ageMs === null) return null;

  const minutes = Math.floor(ageMs / 60_000);
  if (minutes >= 24 * 60) return { label: "Data from yesterday", stale: true };
  if (minutes < 60) return { label: `Updated ${minutes} min ago`, stale: false };

  return { label: "Updated today", stale: false };
}
