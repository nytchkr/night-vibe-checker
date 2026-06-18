// ============================================================
// Night Vibe Checker — Core TypeScript Types
// ============================================================

// --------------- Primitive enums / unions -------------------

export enum VibeTags {
  // Atmosphere
  Lively = "Lively",
  Chill = "Chill",
  Trendy = "Trendy",
  Classy = "Classy",
  Divey = "Divey",
  Intimate = "Intimate",
  // Music
  EDM = "EDM",
  HipHop = "Hip-Hop",
  LiveMusic = "Live Music",
  TopForty = "Top 40",
  Jazz = "Jazz",
  Reggaeton = "Reggaeton",
  // Crowd
  YoungCrowd = "Young Crowd",
  MixedCrowd = "Mixed Crowd",
  UpscaleCrowd = "Upscale Crowd",
  LGBTQFriendly = "LGBTQ+ Friendly",
  LocalsHangout = "Locals Hangout",
  // Practical
  CoverCharge = "Cover Charge",
  NoCoverCharge = "No Cover",
  LongLines = "Long Lines",
  EasyEntry = "Easy Entry",
  GreatCocktails = "Great Cocktails",
  CraftBeer = "Craft Beer",
  // Vibe catch-alls
  HiddenGem = "Hidden Gem",
  Touristy = "Touristy",
  GoodForDates = "Good for Dates",
  GroupFriendly = "Group Friendly",
  Photogenic = "Photogenic",
}

export type VibeTagValue = `${VibeTags}`;

export type EnergyLevel = "Low" | "Medium" | "High" | "Intense";

export type MusicVibe =
  | "None / Background"
  | "Soft / Ambient"
  | "Moderate"
  | "Loud / Dance"
  | "Live Performance";

export type CrowdType =
  | "Sparse"
  | "Moderate"
  | "Packed"
  | "Waiting-List Packed";

export type BestFor =
  | "Date Night"
  | "Group Night Out"
  | "Solo Exploring"
  | "Business Drinks"
  | "Late Night"
  | "Pre-Gaming"
  | "Casual Hangout";

// --------------- Venue types --------------------------------

/** Lightweight venue record returned by search / map pins */
export interface VenueBasic {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Google Places primary type, e.g. "bar", "night_club" */
  type: string;
  /** 1-5 Google rating, may be undefined for new venues */
  googleRating?: number;
  totalRatings?: number;
  priceLevel?: 1 | 2 | 3 | 4; // $ to $$$$
  photoReference?: string;     // Google Places photo reference token
  /** Cached vibe score from our DB — undefined if not yet analyzed */
  cachedVibeScore?: number;
}

/** Full venue record with additional detail fetched on demand */
export interface VenueDetail extends VenueBasic {
  phoneNumber?: string;
  website?: string;
  openingHours?: string[];     // formatted strings from Places API
  editorialSummary?: string;
  photos: string[];            // resolved Google photo URLs (max 5)
  reviews: string[];           // review text snippets passed to the AI
}

// --------------- Vibe Report --------------------------------

/** The core AI-generated vibe assessment */
export interface VibeReport {
  id: string;                  // UUID, generated server-side
  venueId: string;             // FK → venues.place_id
  venueName: string;

  // Scores
  vibeScore: number;           // 0–10 (one decimal place)
  energyLevel: EnergyLevel;

  // Tags (AI picks 3–6 from the VibeTags enum)
  vibeTags: VibeTagValue[];

  // Descriptors
  musicVibe: MusicVibe;
  crowdType: CrowdType;
  bestFor: BestFor[];

  // AI prose
  summary: string;             // 2–3 sentences

  // Meta
  generatedAt: string;         // ISO timestamp
  /** True when report was generated from a user-uploaded photo */
  fromPhoto: boolean;
  /** Confidence 0–1: how certain the AI is given data quality */
  confidence: number;
}

// --------------- Input for AI module ------------------------

/** What the AI analysis module receives to produce a VibeReport */
export interface VibeInput {
  venueId: string;
  venueName: string;
  address: string;
  venueType: string;
  googleRating?: number;
  priceLevel?: number;
  reviews: string[];           // pulled from Places API
  photoBase64?: string;        // optional user-uploaded image
}

// --------------- User-facing records ------------------------

export interface CheckIn {
  id: string;
  userId: string;
  venueId: string;
  venueName: string;
  vibeReportId: string;
  note?: string;
  checkedInAt: string;         // ISO timestamp
}

export interface SavedSpot {
  id: string;
  userId: string;
  venueId: string;
  venueName: string;
  address: string;
  /** Snapshot of the vibe score at time of saving */
  vibeScoreSnapshot?: number;
  savedAt: string;             // ISO timestamp
  tags: VibeTagValue[];        // snapshot of top tags
}

// --------------- API wrapper types --------------------------

export type APIStatus = "success" | "error" | "partial";

/** Generic API response envelope used by all route handlers */
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
    requestId: string;
  };
}

// --------------- Rate limit (shared) ------------------------

export interface RateLimitState {
  count: number;
  windowStart: number;         // epoch ms
}
