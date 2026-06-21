import type { ConsumerVenue } from "@/types";
import { getBusynessState } from "@/lib/busyness";

const siteUrl = "https://night-vibe-checker.vercel.app";

export type VenueShareData = {
  title: string;
  text: string;
  url: string;
};

export function getVenueShareText(venue: Pick<ConsumerVenue, "name" | "signal">): string {
  const busyness = venue.signal?.busyness0To100;
  if (busyness == null || !Number.isFinite(busyness)) return `Check out ${venue.name} on nytchkr`;

  return `Check out ${venue.name} on nytchkr — ${getBusynessState(busyness).label} right now`;
}

export function getVenueShareUrl(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return `${siteUrl}/venues/${encodeURIComponent(venue.slug || venue.id)}`;
}

export function buildVenueShareData(venue: ConsumerVenue): VenueShareData {
  const url = getVenueShareUrl(venue);

  return {
    title: `${venue.name} on nytchkr`,
    text: getVenueShareText(venue),
    url,
  };
}

export function buildVenueShareClipboardText(shareData: ShareData): string {
  const text = shareData.text ?? "";
  if (shareData.url && text.includes(shareData.url)) return text;
  return [text, shareData.url].filter(Boolean).join(" ");
}
