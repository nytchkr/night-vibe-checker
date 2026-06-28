// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorePageClient } from "../ExplorePageClient";
import type { ConsumerVenue, VenueSignal } from "@/types";

const routerPrefetch = vi.fn();
const routerPush = vi.fn();

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: function LinkStub({
      children,
      href,
      prefetch: _prefetch,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      prefetch?: boolean;
      [key: string]: unknown;
    }) {
      return React.createElement("a", { href, "data-prefetch": String(_prefetch), ...props }, children);
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: routerPrefetch, push: routerPush }),
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/components/VenuePhoto", () => ({
  VenuePhoto: ({ name }: { name: string }) => <div aria-label={`${name} photo`} />,
}));

vi.mock("@/lib/useTrack", () => ({
  useTrack: () => vi.fn(),
}));

const venues: ConsumerVenue[] = [
  createVenue({ id: "sports-bar", name: "Sports Bar", category: "bar", rating: 4.6, priceLevel: 2, busyness: 72, source: "live" }),
  createVenue({ id: "neon-lounge", name: "Neon Lounge", category: "lounge", rating: 4.5, priceLevel: 3, busyness: 48, source: "forecast" }),
  createVenue({ id: "supper-club", name: "Supper Club", category: "restaurant", rating: 4.4, priceLevel: 1, busyness: 18, source: "forecast", openNow: false }),
];

function createSignal({
  venueId,
  busyness,
  source,
}: {
  venueId: string;
  busyness: number | null;
  source: VenueSignal["busynessSource"];
}): VenueSignal {
  return {
    venueId,
    placeId: `place-${venueId}`,
    busyness0To100: busyness,
    busynessSource: source,
    mfRatio: null,
    confidence0To1: 0.82,
    sampleSize: 0,
    computedAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z",
    lastBusynessRefresh: null,
  };
}

function createVenue({
  id,
  name,
  category,
  rating,
  priceLevel,
  busyness,
  source,
  openNow = true,
}: {
  id: string;
  name: string;
  category: string;
  rating: number;
  priceLevel: 1 | 2 | 3 | 4;
  busyness: number | null;
  source: VenueSignal["busynessSource"];
  openNow?: boolean;
}): ConsumerVenue {
  return {
    id,
    placeId: `place-${id}`,
    zoneId: "south-end-charlotte",
    name,
    address: "100 Camden Rd, Charlotte, NC",
    lat: 35.2123,
    lng: -80.859,
    neighborhood: "South End",
    category,
    rating,
    googleRating: rating,
    totalRatings: 1240,
    userRatingCount: null,
    priceLevel,
    openNow,
    current_popularity: null,
    vibe_score: null,
    trending: false,
    hidden: false,
    signal: createSignal({ venueId: id, busyness, source }),
  };
}

function mockFetchWithVenues(nextVenues: ConsumerVenue[]) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/venues/suggest")) {
      return Promise.resolve(new Response(JSON.stringify({
        suggestions: nextVenues.slice(0, 5).map((venue) => ({
          id: venue.id,
          name: venue.name,
          category: venue.category,
          zoneId: venue.zoneId,
        })),
      }), { status: 200 }));
    }

    if (url.includes("/api/venues")) {
      return Promise.resolve(new Response(JSON.stringify({ data: { venues: nextVenues } }), { status: 200 }));
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

async function renderExplore() {
  render(<ExplorePageClient />);
  await screen.findAllByRole("link", { name: /^Open / });
}

function venueResults() {
  return screen.getByRole("region", { name: "Venue results" });
}

async function searchFor(query: string) {
  const input = screen.getByRole("searchbox", { name: "Search venues" });
  fireEvent.change(input, { target: { value: query } });
  await waitFor(() => expect(window.location.search).toBe(`?q=${encodeURIComponent(query)}`));
  return input as HTMLInputElement;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/explore");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("fetch", vi.fn());
  mockFetchWithVenues(venues);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ExplorePageClient discovery feed", () => {
  it("renders discovery cards with photo, category, rating, price, open status, and busyness", async () => {
    await renderExplore();

    const sportsBar = within(venueResults()).getByRole("link", { name: /^Open Sports Bar/ });
    expect(within(sportsBar).getByLabelText("Sports Bar photo")).toBeTruthy();
    expect(within(sportsBar).getByText("Bar")).toBeTruthy();
    expect(within(sportsBar).getByText("4.6")).toBeTruthy();
    expect(within(sportsBar).getByText("1,240 reviews")).toBeTruthy();
    expect(within(sportsBar).getByText("$$")).toBeTruthy();
    expect(within(sportsBar).getByText("Open")).toBeTruthy();
    expect(within(sportsBar).getByLabelText("LIVE Packed")).toBeTruthy();
  }, 15_000);

  it("filters venue results by category pills", async () => {
    await renderExplore();

    fireEvent.click(screen.getByRole("button", { name: "Bars" }));

    const results = venueResults();
    expect(screen.getByRole("button", { name: "Bars" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(results).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Neon Lounge/ })).toBeNull();
    expect(within(results).queryByRole("link", { name: /^Open Supper Club/ })).toBeNull();
  });

  it("filters by open now, price, and busyness", async () => {
    await renderExplore();

    fireEvent.click(screen.getByRole("button", { name: "Open Now" }));
    expect(within(venueResults()).queryByRole("link", { name: /^Open Supper Club/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Price $$$" }));
    expect(within(venueResults()).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
    expect(within(venueResults()).queryByRole("link", { name: /^Open Sports Bar/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Moderate" }));
    expect(within(venueResults()).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
  });

  it("filters venues by name as the user types", async () => {
    await renderExplore();

    await searchFor("Neon");

    const results = venueResults();
    expect(within(results).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Sports Bar/ })).toBeNull();
    expect(within(results).queryByRole("link", { name: /^Open Supper Club/ })).toBeNull();
  });

  it("clears search from the X button", async () => {
    await renderExplore();
    const input = await searchFor("Neon");

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => expect(input.value).toBe(""));
    expect(within(venueResults()).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(venueResults()).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
  });

  it("shows the required empty state when no venues match", async () => {
    await renderExplore();

    await searchFor("zzzz");

    expect(screen.getByRole("heading", { name: "No venues found in this area yet." })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByRole("link", { name: /^Open Sports Bar/ })).toBeNull();
  });

  it("shows autocomplete suggestions and navigates to a selected venue", async () => {
    await renderExplore();

    const input = screen.getByRole("searchbox", { name: "Search venues" });
    fireEvent.change(input, { target: { value: "Neo" } });

    const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe("explore-search-suggestions");

    await userEvent.click(within(listbox).getByRole("option", { name: /Neon Lounge/ }));

    expect(routerPush).toHaveBeenCalledWith("/venues/neon-lounge");
  });

  it("manually prefetches venue detail routes once on hover and touch", async () => {
    await renderExplore();

    const sportsBar = within(venueResults()).getByRole("link", { name: /^Open Sports Bar/ });
    expect(sportsBar.getAttribute("data-prefetch")).toBe("false");

    fireEvent.mouseEnter(sportsBar);
    fireEvent.mouseEnter(sportsBar);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenCalledWith("/venues/sports-bar");

    fireEvent.touchStart(sportsBar);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);

    const neonLounge = within(venueResults()).getByRole("link", { name: /^Open Neon Lounge/ });
    fireEvent.touchStart(neonLounge);
    expect(routerPrefetch).toHaveBeenCalledTimes(2);
    expect(routerPrefetch).toHaveBeenLastCalledWith("/venues/neon-lounge");
  });

  it("renders skeleton venue cards during initial load", async () => {
    let resolveVenues: (response: Response) => void = () => {};
    const venuesPromise = new Promise<Response>((resolve) => {
      resolveVenues = resolve;
    });

    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/venues")) return venuesPromise;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(<ExplorePageClient />);

    await waitFor(() => expect(screen.getAllByRole("status", { name: "Loading venue card" })).toHaveLength(6));
    await act(async () => {
      resolveVenues(new Response(JSON.stringify({ data: { venues } }), { status: 200 }));
    });
    await screen.findByRole("region", { name: "Venue results" });
  });
});
