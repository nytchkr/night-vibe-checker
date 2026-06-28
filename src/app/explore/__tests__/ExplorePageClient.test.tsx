// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorePageClient } from "../ExplorePageClient";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";
import type { ConsumerVenue, VenueSignal } from "@/types";

const routerPrefetch = vi.fn();

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
  useRouter: () => ({ prefetch: routerPrefetch }),
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const createMotionComponent = (tag: string | React.ComponentType<Record<string, unknown>>) =>
    function MotionComponent({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      whileTap: _whileTap,
      whileHover: _whileHover,
      layout: _layout,
      layoutId: _layoutId,
      variants: _variants,
      ...props
    }: {
      children?: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      whileTap?: unknown;
      whileHover?: unknown;
      layout?: unknown;
      layoutId?: unknown;
      variants?: unknown;
      [key: string]: unknown;
    }) {
      return React.createElement(tag, props, children);
    };

  const motion = new Proxy({ create: createMotionComponent }, {
    get: (target, tag: string) => tag in target ? target[tag as keyof typeof target] : createMotionComponent(tag),
  });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    motion,
  };
});

vi.mock("framer-motion/client", async () => {
  const React = await import("react");
  const createMotionComponent = (tag: string) =>
    function MotionComponent({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      variants: _variants,
      ...props
    }: {
      children?: React.ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      variants?: unknown;
      [key: string]: unknown;
    }) {
      return React.createElement(tag, props, children);
    };

  return {
    div: createMotionComponent("div"),
    li: createMotionComponent("li"),
    span: createMotionComponent("span"),
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

vi.mock("@/lib/clientTrendingVenueIds", () => ({
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

function createSignal(overrides: Partial<VenueSignal> = {}): VenueSignal {
  return {
    venueId: "sports-bar",
    placeId: "place-sports-bar",
    busyness0To100: 72,
    busynessSource: "crowd",
    mfRatio: 62,
    confidence0To1: 0.82,
    sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO,
    computedAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z",
    lastBusynessRefresh: null,
    ...overrides,
  };
}

function createVenue({
  id,
  name,
  category,
  rating,
  googleRating = rating,
  currentPopularity = null,
  vibeScore = null,
  lat = 35.2123,
  lng = -80.859,
  signal = null,
}: {
  id: string;
  name: string;
  category: string;
  rating: number;
  googleRating?: number;
  currentPopularity?: number | null;
  vibeScore?: number | null;
  lat?: number;
  lng?: number;
  signal?: VenueSignal | null;
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
    googleRating,
    userRatingCount: 120,
    priceLevel: 2,
    openNow: true,
    current_popularity: currentPopularity,
    vibe_score: vibeScore,
    trending: false,
    hidden: false,
    signal,
  };
}

function mockFetchWithVenues(nextVenues: ConsumerVenue[]) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/activity/feed")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }

    if (url.includes("/api/zones/south-end-charlotte/stats")) {
      return Promise.resolve(new Response(JSON.stringify({
        zoneId: "south-end-charlotte",
        liveCheckInCount: 0,
        topVenueId: null,
        topVenueName: null,
        venueCount: nextVenues.length,
      }), { status: 200 }));
    }

    if (url.includes("/api/zones/dilworth-charlotte/stats")) {
      return Promise.resolve(new Response(JSON.stringify({
        zoneId: "dilworth-charlotte",
        liveCheckInCount: 0,
        topVenueId: null,
        topVenueName: null,
        venueCount: 0,
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
  await screen.findByLabelText("Live zone activity");
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
  it("filters venue results to bars from the Bars category pill", async () => {
    mockFetchWithVenues([
      createVenue({ id: "sports-bar", name: "Sports Bar", category: "bar", rating: 4.6 }),
      createVenue({ id: "supper-club", name: "Supper Club", category: "restaurant", rating: 4.5 }),
      createVenue({ id: "coffee-house", name: "Coffee House", category: "coffee", rating: 4.4 }),
    ]);

    await renderExplore();

    fireEvent.click(screen.getByRole("button", { name: "Bars" }));

    const results = venueResults();
    expect(screen.getByRole("button", { name: "Bars" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(results).getByRole("link", { name: /^Open Sports Bar/ })).toBeTruthy();
    expect(within(results).queryByRole("link", { name: /^Open Supper Club/ })).toBeNull();
    expect(within(results).queryByRole("link", { name: /^Open Coffee House/ })).toBeNull();
  });

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

    expect(screen.getByRole("heading", { name: "No venues found" })).toBeTruthy();
    expect(screen.getByText("Try a different search or category filter")).toBeTruthy();
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

  it("sorts by Trending, Most Active, and Highest Rated client-side", async () => {
    mockFetchWithVenues([
      createVenue({ id: "low-vibe", name: "Low Vibe", category: "lounge", rating: 4.8, googleRating: 4.8, currentPopularity: 72, vibeScore: 20 }),
      createVenue({ id: "active-bar", name: "Active Bar", category: "bar", rating: 4.1, googleRating: 4.1, currentPopularity: 96, vibeScore: 40 }),
      createVenue({ id: "top-rated", name: "Top Rated", category: "coffee", rating: 4.9, googleRating: 4.9, currentPopularity: 44, vibeScore: 92 }),
    ]);

    await renderExplore();

    const resultLinks = () => within(venueResults()).getAllByRole("link", { name: /^Open / });
    expect(screen.getByRole("button", { name: "Trending" }).getAttribute("aria-pressed")).toBe("true");
    expect(resultLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/venues/top-rated",
      "/venues/active-bar",
      "/venues/low-vibe",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Most Active" }));
    expect(resultLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/venues/active-bar",
      "/venues/low-vibe",
      "/venues/top-rated",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Highest Rated" }));
    expect(resultLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/venues/top-rated",
      "/venues/low-vibe",
      "/venues/active-bar",
    ]);
  });

  it("renders live zone activity with the hottest zone highlighted", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/activity/feed")) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      }

      if (url.includes("/api/zones/south-end-charlotte/stats")) {
        return Promise.resolve(new Response(JSON.stringify({
          zoneId: "south-end-charlotte",
          liveCheckInCount: 12,
          topVenueId: null,
          topVenueName: null,
          venueCount: 25,
        }), { status: 200 }));
      }

      if (url.includes("/api/zones/dilworth-charlotte/stats")) {
        return Promise.resolve(new Response(JSON.stringify({
          zoneId: "dilworth-charlotte",
          liveCheckInCount: 3,
          topVenueId: null,
          topVenueName: null,
          venueCount: 9,
        }), { status: 200 }));
      }

      if (url.includes("/api/venues")) {
        return Promise.resolve(new Response(JSON.stringify({ data: { venues } }), { status: 200 }));
      }

      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await renderExplore();

    await waitFor(() => {
      expect(screen.getByText("🔥 South End · 12 here")).toBeTruthy();
      expect(screen.getByText("Dilworth · 3 here")).toBeTruthy();
    });
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

  it("uses touchstart instead of mouseenter on touch devices", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    await renderExplore();

    const sportsBar = within(venueResults()).getByRole("link", { name: /^Open Sports Bar/ });
    fireEvent.mouseEnter(sportsBar);
    expect(routerPrefetch).not.toHaveBeenCalled();

    fireEvent.touchStart(sportsBar);
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenCalledWith("/venues/sports-bar");
  });

  it("only shows the M/F ratio pill when check-ins meet the sample threshold", async () => {
    mockFetchWithVenues([
      createVenue({
        id: "sample-ready-bar",
        name: "Sample Ready Bar",
        category: "bar",
        rating: 4.8,
        signal: createSignal({
          venueId: "sample-ready-bar",
          placeId: "place-sample-ready-bar",
          mfRatio: 62,
          sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO,
        }),
      }),
      createVenue({
        id: "thin-sample-bar",
        name: "Thin Sample Bar",
        category: "bar",
        rating: 4.7,
        signal: createSignal({
          venueId: "thin-sample-bar",
          placeId: "place-thin-sample-bar",
          mfRatio: 58,
          sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO - 1,
        }),
      }),
    ]);

    render(<ExplorePageClient />);

    const results = await screen.findByRole("region", { name: "Venue results" });
    const sampleReadyBar = await within(results).findByRole("link", { name: /^Open Sample Ready Bar/ });
    const thinSampleBar = within(results).getByRole("link", { name: /^Open Thin Sample Bar/ });

    expect(within(sampleReadyBar).getByTitle(`M/F ratio from ${MIN_SAMPLE_SIZE_FOR_RATIO} check-ins`)).toBeTruthy();
    expect(within(sampleReadyBar).getByLabelText(/62% male, 38% female/i)).toBeTruthy();
    expect(within(thinSampleBar).queryByTitle(/M\/F ratio from/i)).toBeNull();
  });

  it("renders skeleton venue cards during the initial load", async () => {
    let resolveVenues: (response: Response) => void = () => {};
    const venuesPromise = new Promise<Response>((resolve) => {
      resolveVenues = resolve;
    });

    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/api/activity/feed")) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      }

      if (url.includes("/api/zones/south-end-charlotte/stats")) {
        return Promise.resolve(new Response(JSON.stringify({
          zoneId: "south-end-charlotte",
          liveCheckInCount: 0,
          topVenueId: null,
          topVenueName: null,
          venueCount: venues.length,
        }), { status: 200 }));
      }

      if (url.includes("/api/zones/dilworth-charlotte/stats")) {
        return Promise.resolve(new Response(JSON.stringify({
          zoneId: "dilworth-charlotte",
          liveCheckInCount: 0,
          topVenueId: null,
          topVenueName: null,
          venueCount: 0,
        }), { status: 200 }));
      }

      if (url.includes("/api/venues")) {
        return venuesPromise;
      }

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
