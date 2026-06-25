import type { ConsumerVenue } from "@/types";
import { getBusynessState } from "@/lib/busyness";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";

const siteUrl = "https://nytchkr.com";

export type VenueShareData = {
  title: string;
  text: string;
  url: string;
};

function getVenueShareMfText(signal: ConsumerVenue["signal"]): string | null {
  if (!signal || signal.sampleSize < MIN_SAMPLE_SIZE_FOR_RATIO || signal.mfRatio == null || !Number.isFinite(signal.mfRatio)) return null;

  const male = Math.min(100, Math.max(0, Math.round(signal.mfRatio)));
  return `${male}% M / ${100 - male}% F`;
}

export function getVenueShareText(venue: Pick<ConsumerVenue, "id" | "slug" | "name" | "signal">): string {
  const url = getVenueShareUrl(venue);
  const busyness = venue.signal?.busyness0To100;
  if (busyness == null || !Number.isFinite(busyness)) return `Check out ${venue.name} on nytchkr: live vibe not available yet. ${url}`;

  const busynessLabel = getBusynessState(busyness).level ?? "unknown";
  const mfText = getVenueShareMfText(venue.signal);
  const signalText = [`${busynessLabel} right now`, mfText].filter(Boolean).join(" · ");

  return `Check out ${venue.name} on nytchkr: ${signalText}. ${url}`;
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
