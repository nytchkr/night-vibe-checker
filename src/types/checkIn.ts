// ============================================================
// Night Vibe Checker — Check-In Types (NV-042)
// ============================================================

export type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";
export type MusicType = "house" | "hiphop" | "rnb" | "techno" | "live" | "mixed" | "none";

export interface LiveCheckIn {
  id: string;
  venueId: string;
  venueName: string;
  crowdLevel: CrowdLevel;
  vibeScore: number;
  musicType?: MusicType;
  waitMinutes?: number;
  tags: string[];
  note?: string;
  userId?: string;
  sessionId?: string;
  createdAt: string;
}

export interface CheckInSummary {
  venueId: string;
  avgVibeScore: number;
  dominantCrowd: CrowdLevel;
  reportCount: number;
  summaryReportCount: number;
  isSummaryPartial: boolean;
  lastReportAt: string;
}
