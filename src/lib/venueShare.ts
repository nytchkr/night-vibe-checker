import type { ConsumerVenue, VenueSignal } from "@/types";

const siteUrl = "https://night-vibe-checker.vercel.app";

function shareStatusLabel(busyness: number | null | undefined): string | null {
  if (busyness == null) return null;
  if (busyness >= 67) return "packed 🔥";
  if (busyness >= 34) return "getting busy";
  return "pretty chill";
}

function shareSourceLabel(source: VenueSignal["busynessSource"] | null | undefined): string {
  if (source === "live" || source === "crowd") return " (live)";
  if (source === "forecast") return " (forecast)";
  return "";
}

export function getVenueShareUrl(venue: Pick<ConsumerVenue, "id">): string {
  return `${siteUrl}/venues/${encodeURIComponent(venue.id)}`;
}

export function buildVenueShareData(venue: ConsumerVenue): ShareData {
  const signal = venue.signal;
  const busyness = signal?.busyness0To100;
  const label = shareStatusLabel(busyness);
  const mf = signal?.mfRatio != null ? ` · ${Math.round(signal.mfRatio)}% guys` : "";
  const source = shareSourceLabel(signal?.busynessSource);
  const text = label
    ? `${venue.name} is ${label} right now${mf}${source} — NightVibe`
    : `${venue.name} has no current crowd read right now${source} — NightVibe`;

  return {
    title: venue.name,
    text,
    url: getVenueShareUrl(venue),
  };
}
