import type { ConsumerVenue } from "@/types";
import { getBusynessState } from "@/lib/busyness";
import { getVenuePublicUrl } from "@/lib/seo";

export type VenueShareData = {
  title: string;
  text: string;
  url: string;
};

export function getVenueShareText(venue: Pick<ConsumerVenue, "id" | "slug" | "name" | "signal">): string {
  const url = getVenueShareUrl(venue);
  const busyness = venue.signal?.busyness0To100;
  if (busyness == null || !Number.isFinite(busyness)) return `Check out ${venue.name} on nytchkr: busyness data is not available yet. ${url}`;

  const busynessLabel = getBusynessState(busyness).level ?? "unknown";

  return `Check out ${venue.name} on nytchkr: ${busynessLabel} right now. ${url}`;
}

export function getVenueShareUrl(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return getVenuePublicUrl(venue);
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
