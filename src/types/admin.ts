// ============================================================
// Admin types — check-in moderation
// ============================================================

import type { ConsumerCheckIn } from "./consumer";

// AdminCheckIn extends ConsumerCheckIn with moderation fields.
// userId may be null for anonymous check-ins.
// venueName is optional — populated client-side when available.
export interface AdminCheckIn extends ConsumerCheckIn {
  hidden: boolean;
  userId: string | null;
  venueName?: string;
}

export interface AdminVenue {
  id: string;
  placeId: string;
  name: string;
  address: string;
  category: string;
  hidden: boolean;
  lastBusynessRefresh: string | null;
  busyness0To100: number | null;
  sampleSize: number;
}
