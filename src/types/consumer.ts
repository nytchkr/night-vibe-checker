export type ReportedBusyness = "dead" | "moderate" | "packed";
export type CrowdFeel = "mostly_male" | "mostly_female" | "balanced" | "mixed";
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
  lastBusynessRefresh: string | null;
}

export interface ConsumerVenue {
  id: string;
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  googleRating?: number;
  totalRatings?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  photoReference?: string;
  photoUrl?: string;
  hidden: boolean;
  signal?: VenueSignal;
}

export interface ConsumerCheckIn {
  id: string;
  venueId: string;
  placeId: string;
  busyness: ReportedBusyness;
  crowdFeel: CrowdFeel;
  note?: string;
  createdAt: string;
}
