import type { ConsumerVenue } from "@/types";

const siteUrl = "https://night-vibe-checker.vercel.app";

function shareBusynessText(busyness: number | null | undefined): string {
  if (busyness == null || !Number.isFinite(busyness)) return "crowd status unavailable right now";
  return `${Math.round(Math.min(100, Math.max(0, busyness)))}% packed right now`;
}

export function getVenueShareUrl(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return `${siteUrl}/venues/${encodeURIComponent(venue.slug || venue.id)}`;
}

export function buildVenueShareData(venue: ConsumerVenue): ShareData {
  const url = getVenueShareUrl(venue);

  return {
    title: `${venue.name} on NightVibe`,
    text: `Check out ${venue.name} on NightVibe — ${shareBusynessText(venue.signal?.busyness0To100)}`,
    url,
  };
}

export function buildVenueShareClipboardText(shareData: ShareData): string {
  const text = shareData.text ?? "";
  if (shareData.url && text.includes(shareData.url)) return text;
  return [text, shareData.url].filter(Boolean).join(" ");
}
