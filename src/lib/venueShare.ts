import type { ConsumerVenue, VenueSignal } from "@/types";

const siteUrl = "https://night-vibe-checker.vercel.app";

function shareStatusLabel(busyness: number | null | undefined): string {
  if (busyness == null) return "no crowd read";
  if (busyness >= 67) return "packed 🔥";
  if (busyness >= 34) return "getting busy";
  return "pretty chill";
}

function shareSourceLabel(source: VenueSignal["busynessSource"] | null | undefined): string {
  if (source === "live" || source === "crowd") return " (live)";
  if (source === "forecast") return " (forecast)";
  return "";
}

export function getVenueShareUrl(venue: Pick<ConsumerVenue, "id" | "slug">): string {
  return `${siteUrl}/venue/${encodeURIComponent(venue.slug || venue.id)}`;
}

export function buildVenueShareData(venue: ConsumerVenue): ShareData {
  const signal = venue.signal;
  const label = shareStatusLabel(signal?.busyness0To100);
  const source = shareSourceLabel(signal?.busynessSource);
  const url = getVenueShareUrl(venue);

  return {
    title: venue.name,
    text: `Check out ${venue.name} on nytchkr — ${label}${source} right now. ${url}`,
    url,
  };
}

export function buildVenueShareClipboardText(shareData: ShareData): string {
  const text = shareData.text ?? "";
  if (shareData.url && text.includes(shareData.url)) return text;
  return [text, shareData.url].filter(Boolean).join(" ");
}
