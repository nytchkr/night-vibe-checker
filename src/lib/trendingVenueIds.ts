import type { APIResponse, ConsumerVenue } from "@/types";

export async function fetchTrendingVenueIds(signal?: AbortSignal): Promise<Set<string>> {
  const res = await fetch("/api/venues/trending", { signal });
  if (!res.ok) throw new Error(`Trending venues failed: ${res.status}`);

  const json = (await res.json()) as APIResponse<{ venues: ConsumerVenue[] }>;
  const venues = json.data?.venues ?? [];

  return new Set(
    venues
      .map((venue) => venue.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}
