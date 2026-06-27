// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorePageClient } from "../ExplorePageClient";
import type { ConsumerVenue } from "@/types";

vi.mock("next/dynamic", () => ({
  default: () => function DynamicStub() {
    return null;
  },
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: function LinkStub({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      [key: string]: unknown;
    }) {
      return React.createElement("a", { href, ...props }, children);
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn() }),
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const createMotionComponent = (tag: string) =>
    function MotionComponent({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children?: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) {
      return React.createElement(tag, props, children);
    };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion: new Proxy({}, {
      get: (_target, tag: string) => createMotionComponent(tag),
    }),
  };
});

vi.mock("@/components/TrendingRow", () => ({
  TrendingRow: () => null,
}));

vi.mock("@/components/VenuePhoto", () => ({
  VenuePhoto: ({ name }: { name: string }) => <div aria-label={`${name} photo`} />,
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: () => ({ pulling: false, refreshing: false }),
}));

vi.mock("@/hooks/useSavedVenues", () => ({
  useSavedVenues: () => ({ savedIds: new Set<string>() }),
}));

vi.mock("@/hooks/useHaptic", () => ({
  useHaptic: () => ({ light: vi.fn() }),
}));

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
  }),
}));

vi.mock("@/lib/trendingVenueIds", () => ({
  fetchTrendingVenueIds: () => Promise.resolve(new Set<string>()),
}));

vi.mock("@/lib/useTrack", () => ({
  useTrack: () => vi.fn(),
}));

const venues: ConsumerVenue[] = [
  createVenue({ id: "sports-bar", name: "Sports Bar", category: "bar", rating: 4.6 }),
  createVenue({ id: "neon-lounge", name: "Neon Lounge", category: "lounge", rating: 4.5 }),
  createVenue({ id: "coffee-house", name: "Coffee House", category: "coffee", rating: 4.4 }),
];

function createVenue({
  id,
  name,
  category,
  rating,
  lat = 35.2123,
  lng = -80.859,
}: {
  id: string;
  name: string;
  category: string;
  rating: number;
  lat?: number;
  lng?: number;
}): ConsumerVenue {
  return {
    id,
    placeId: `place-${id}`,
    zoneId: "south-end-charlotte",
    name,
    address: "100 Camden Rd, Charlotte, NC",
    lat,
    lng,
    neighborhood: "South End",
    category,
    rating,
    googleRating: rating,
    userRatingCount: 120,
    priceLevel: 2,
    openNow: true,
    current_popularity: null,
    vibe_score: null,
    trending: false,
    hidden: false,
    signal: null,
  };
}

function mockFetchWithVenues(nextVenues: ConsumerVenue[]) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/activity/feed")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
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
  await userEvent.clear(input);
  await userEvent.type(input, query);
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
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
    },
  });
  vi.stubGlobal("fetch", vi.fn());
  mockFetchWithVenues(venues);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ExplorePageClient venue search", () => {
  it("filters venues by name as the user types", async () => {
    await renderExplore();

    await searchFor("Neon");

    const results = venueResults();
    expect(within(results).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Sports Bar/ })).toBeNull();
    expect(within(results).queryByRole("link", { name: /^Open Coffee House/ })).toBeNull();
  });

  it("clears the search and restores the full venue list from the X button", async () => {
    await renderExplore();
    const input = await searchFor("Neon");

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => expect(input.value).toBe(""));
    const results = venueResults();
    expect(within(results).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(results).getByRole("link", { name: /^Open Neon Lounge/ })).toBeTruthy();
    expect(within(results).getByRole("link", { name: /^Open Coffee House/ })).toBeTruthy();
  });

  it("shows the no-results empty state when no venues match", async () => {
    await renderExplore();

    await searchFor("zzzz");

    expect(screen.getByRole("heading", { name: 'No results for "zzzz"' })).toBeTruthy();
    expect(within(venueResults()).queryByRole("link", { name: /^Open Sports Bar/ })).toBeNull();
  });

  it("matches venue names case-insensitively", async () => {
    await renderExplore();

    await searchFor("sPoRtS");

    const results = venueResults();
    expect(within(results).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Neon Lounge/ })).toBeNull();
  });

  it("matches partial strings in venue names", async () => {
    await renderExplore();

    await searchFor("port");

    const results = venueResults();
    expect(within(results).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Neon Lounge/ })).toBeNull();
  });

  it("sorts by Near Me and shows distance badges after geolocation succeeds", async () => {
    const nearMeVenues = [
      createVenue({ id: "far-lounge", name: "Far Lounge", category: "lounge", rating: 4.8, lat: 35.23, lng: -80.88 }),
      createVenue({ id: "near-bar", name: "Near Bar", category: "bar", rating: 4.1, lat: 35.2165, lng: -80.859 }),
      createVenue({ id: "middle-cafe", name: "Middle Cafe", category: "coffee", rating: 4.6, lat: 35.22, lng: -80.859 }),
    ];
    mockFetchWithVenues(nearMeVenues);
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((success) => {
      success({
        coords: {
          latitude: 35.2123,
          longitude: -80.859,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON() { return {}; },
        } as GeolocationCoordinates,
        timestamp: Date.now(),
        toJSON() { return {}; },
      } as GeolocationPosition);
    });

    await renderExplore("Far Lounge");
    await userEvent.click(screen.getByRole("button", { name: "Near Me" }));

    await waitFor(() => expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("0.3 mi")).toBeTruthy());

    const resultLinks = within(venueResults()).getAllByRole("link", { name: /^Open / });
    expect(resultLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/venues/near-bar",
      "/venues/middle-cafe",
      "/venues/far-lounge",
    ]);
  });

  it("falls back to the default sort and explains when geolocation is denied", async () => {
    vi.mocked(navigator.geolocation.getCurrentPosition).mockImplementation((_success, error) => {
      error?.({
        code: 1,
        message: "User denied Geolocation",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });

    await renderExplore();
    await userEvent.click(screen.getByRole("button", { name: "Near Me" }));

    expect(await screen.findByText("Location access was denied. Enable location to sort nearby spots.")).toBeTruthy();
    expect(within(venueResults()).queryByText(/ mi$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Hottest" }).getAttribute("aria-pressed")).toBe("true");
  });
});
