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

// --------------- Consumer domain types -----------------------

export type BusynessSource = "live" | "forecast" | "crowd" | "unavailable";

export interface VenueSignal {
  venueId: string;
  placeId: string;
  busyness0To100: number | null;
  busynessSource: BusynessSource | null;
  confidence0To1: number;
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
  userAvgRating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: 1 | 2 | 3 | 4 | null;
  photoReference?: string;
  photoUrl?: string;
  photoUrls?: string[];
  photo_urls?: string[];
  phone?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUri?: string;
  editorialSummary?: string;
  openingHours?: string[];
  opening_hours?: { open_now?: boolean | null } | null;
  openNow?: boolean | null;
  open_now?: boolean | null;
  current_popularity?: number | null;
  trending?: boolean | null;
  besttimeVenueId?: string;
  hidden: boolean;
  signal: VenueSignal | null;
}
