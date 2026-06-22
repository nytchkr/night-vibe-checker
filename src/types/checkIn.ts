// ============================================================
// VibeCheck — Consumer Check-In Types
// ============================================================

import type { ConsumerCheckIn, CrowdFeel, ReportedBusyness } from "./consumer";

export type { ConsumerCheckIn, CrowdFeel, ReportedBusyness };

export interface CheckInSummary {
  venueId: string;
  busyness0To100: number | null;
  busynessSource: "live" | "forecast" | "crowd" | "unavailable" | null;
  mfRatio: number | null;
  confidence0To1: number;
  sampleSize: number;
  computedAt: string | null;
}
