import type { ConsumerVenue } from "@/types";

export const SITE_URL = "https://nytchkr.com";
export const DEFAULT_OG_IMAGE_PATH = "/og-image.png";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getVenuePublicPath(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return `/venues/${encodeURIComponent(venue.slug || venue.id)}`;
}

export function getVenuePublicUrl(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return absoluteUrl(getVenuePublicPath(venue));
}
