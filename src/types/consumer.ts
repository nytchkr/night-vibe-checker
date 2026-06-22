// --------------- API envelope --------------------------------
// Shared by all API routes and E2E test helpers.

export type APIStatus = "success" | "error" | "partial";

export interface APIResponse<T> {
  status: APIStatus;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    cached: boolean;
    generatedAt: string;
    [key: string]: unknown;
  };
}

// --------------- Legacy shims --------------------------------
// VenueBasic and VibeReport were removed from vibe.ts.
// Kept here as minimal shims so E2E specs continue to compile
// until they are rewritten against the new ConsumerVenue type.

export interface VenueBasic {
  placeId: string;
  name: string;
  googleRating?: number;
  totalRatings?: number;
  priceLevel?: number;
  address?: string;
  lat?: number;
  lng?: number;
  type?: string;
  /** @deprecated use busyness signals from ConsumerVenue.signal */
  cachedVibeScore?: number | null;
}

export interface VibeReport {
  id?: string;
  venueId?: string;
  venueName?: string;
  vibeScore: number;
  vibeTags: string[];
  energyLevel: string;
  musicVibe: string;
  bestFor: string[];
  crowdType: string;
  /** @deprecated use vibeSummary */
  summary?: string;
  vibeSummary?: string;
  confidence: number | "low" | "medium" | "high";
  fromPhoto?: boolean;
  cached?: boolean;
  cachedAt?: string;
  generatedAt?: string;
  [key: string]: unknown;
}

// --------------- Consumer domain types -----------------------

export type ReportedBusyness = "dead" | "moderate" | "packed";
export type CrowdFeel =
  | "chill"
  | "hyped"
  | "mixed"
  | "dead"
  | "packed"
  | "mostly_male"
  | "mostly_female"
  | "balanced";
export type BusynessSource = "live" | "forecast" | "crowd";

export interface VenueSignal {
  venueId: string;
  placeId: string;
  busyness0To100: number | null;
  busynessSource: BusynessSource | null;
  mfRatio: number | null;
  confidence0To1: number;
  sampleSize: number;
  computedAt: string;
  updatedAt: string | null;
  lastBusynessRefresh: string | null;
}

export interface ConsumerVenue {
  id: string;
  slug?: string;
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  neighborhood?: string;
  category: string;
  rating?: number | null;
  googleRating?: number;
  totalRatings?: number;
  userRatingCount?: number | null;
  priceLevel?: 1 | 2 | 3 | 4 | null;
  photoReference?: string;
  photoUrl?: string;
  photoUrls?: string[];
  phone?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUri?: string;
  editorialSummary?: string;
  openingHours?: string[];
  openNow?: boolean;
  besttimeVenueId?: string;
  hidden: boolean;
  signal: VenueSignal | null;
}

export interface ConsumerCheckIn {
  id: string;
  venueId: string;
  placeId: string;
  venueName?: string;
  busyness: ReportedBusyness;
  crowdFeel: CrowdFeel;
  note?: string;
  createdAt: string;
}
