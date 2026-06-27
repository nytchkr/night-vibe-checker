// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorePageClient } from "../ExplorePageClient";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";
import type { ConsumerVenue, VenueSignal } from "@/types";

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
  usePullToRefresh: () => ({ pulling: false, refreshing: false, pullDistance: 0 }),
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

function createVenue(signal: VenueSignal | null): ConsumerVenue {
  return {
    id: "sports-bar",
    placeId: "place-sports-bar",
    zoneId: "south-end-charlotte",
    name: "Sports Bar",
    address: "100 Camden Rd, Charlotte, NC",
    lat: 35.2123,
    lng: -80.859,
    neighborhood: "South End",
    category: "bar",
    rating: 4.6,
    googleRating: 4.6,
    userRatingCount: 120,
    priceLevel: 2,
    openNow: true,
    current_popularity: null,
    vibe_score: null,
    trending: false,
    hidden: false,
    signal,
  };
}

function mockFetchWithVenue(venue: ConsumerVenue) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/activity/feed")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }

    if (url.includes("/api/venues")) {
      return Promise.resolve(new Response(JSON.stringify({ data: { venues: [venue] } }), { status: 200 }));
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

async function renderExploreWithVenue(venue: ConsumerVenue) {
  mockFetchWithVenue(venue);
  render(<ExplorePageClient />);
  const results = await screen.findByRole("region", { name: "Venue results" });
  return within(results).findByRole("link", { name: "Open Sports Bar" });
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ExplorePageClient M/F bar integration", () => {
  it("shows the M/F bar when the venue has enough samples and an M/F ratio", async () => {
    const venueCard = await renderExploreWithVenue(createVenue(createSignal({
      mfRatio: 62,
      sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO,
    })));

    expect(within(venueCard).getByTitle(`M/F ratio from ${MIN_SAMPLE_SIZE_FOR_RATIO} check-ins`)).toBeTruthy();
    expect(within(venueCard).getByLabelText(/62% male, 38% female/i)).toBeTruthy();
  });

  it("hides the M/F bar when the venue sample size is below the threshold", async () => {
    const venueCard = await renderExploreWithVenue(createVenue(createSignal({
      mfRatio: 62,
      sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO - 1,
    })));

    await waitFor(() => expect(within(venueCard).queryByTitle(/M\/F ratio from/i)).toBeNull());
  });

  it("hides the M/F bar when the venue M/F ratio is null", async () => {
    const venueCard = await renderExploreWithVenue(createVenue(createSignal({
      mfRatio: null,
      sampleSize: MIN_SAMPLE_SIZE_FOR_RATIO + 3,
    })));

    await waitFor(() => expect(within(venueCard).queryByTitle(/M\/F ratio from/i)).toBeNull());
  });

  it("shows a tooltip with the check-in sample size", async () => {
    const sampleSize = MIN_SAMPLE_SIZE_FOR_RATIO + 4;
    const venueCard = await renderExploreWithVenue(createVenue(createSignal({
      mfRatio: 41,
      sampleSize,
    })));

    expect(within(venueCard).getByTitle(`M/F ratio from ${sampleSize} check-ins`)).toBeTruthy();
  });
});
