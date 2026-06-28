// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VenueMap } from "@/components/VenueMap";
import { DEFAULT_CITY } from "@/lib/cities";
import type { ConsumerVenue } from "@/types";

const push = vi.fn();
const markerHandlers: Array<Record<string, (event?: unknown) => void>> = [];

const mockMap = {
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  getBounds: vi.fn(() => ({ contains: () => true })),
  getMaxZoom: vi.fn(() => 18),
  getZoom: vi.fn(() => 15),
  invalidateSize: vi.fn(),
  removeLayer: vi.fn(),
  setView: vi.fn(),
};

vi.mock("next/link", () => ({
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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicComponentStub() {
      return null;
    },
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock("framer-motion/client", () => ({
  aside: ({
    children,
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    ...props
  }: React.HTMLAttributes<HTMLElement> & {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
  }) => React.createElement("aside", props, children),
}));

vi.mock("@/components/MapBottomSheet", () => ({
  default: () => null,
}));

vi.mock("@/components/RoutePrefetch", () => ({
  prefetchRoute: vi.fn(),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock("@/hooks/useHaptic", () => ({
  useHaptic: () => ({ light: vi.fn(), medium: vi.fn(), success: vi.fn() }),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: () => ({ pulling: false, refreshing: false }),
}));

vi.mock("@/lib/clientTrendingVenueIds", () => ({
  fetchTrendingVenueIds: vi.fn(async () => new Set<string>()),
}));

vi.mock("@/lib/useDevice", () => ({
  useDevice: () => ({ isDesktop: false }),
}));

vi.mock("leaflet.markercluster", () => ({}));

vi.mock("leaflet", () => {
  function createMarker() {
    const handlers: Record<string, (event?: unknown) => void> = {};
    markerHandlers.push(handlers);

    return {
      bindTooltip: vi.fn(),
      getElement: () => document.createElement("button"),
      on: vi.fn((eventName: string, handler: (event?: unknown) => void) => {
        handlers[eventName] = handler;
      }),
    };
  }

  return {
    default: {
      DomEvent: { stop: vi.fn() },
      divIcon: vi.fn((options) => options),
      latLngBounds: vi.fn(() => ({
        isValid: () => true,
        pad: () => "bounds",
      })),
      marker: vi.fn(createMarker),
      markerClusterGroup: vi.fn(() => ({
        addLayer: vi.fn(),
        getChildCount: vi.fn(() => 1),
        on: vi.fn(),
      })),
    },
  };
});

vi.mock("react-leaflet", () => ({
  Circle: () => null,
  CircleMarker: () => null,
  MapContainer: React.forwardRef<HTMLDivElement, {
    children: React.ReactNode;
    whenReady?: () => void;
  }>(function MapContainerStub({ children, whenReady }, ref) {
    React.useImperativeHandle(ref, () => mockMap as unknown as HTMLDivElement);

    React.useEffect(() => {
      whenReady?.();
    }, [whenReady]);

    return <div data-testid="leaflet-map">{children}</div>;
  }),
  TileLayer: ({
    eventHandlers,
  }: {
    eventHandlers?: {
      load?: () => void;
    };
  }) => {
    React.useEffect(() => {
      eventHandlers?.load?.();
    }, [eventHandlers]);

    return null;
  },
  useMap: () => mockMap,
  useMapEvents: vi.fn(() => mockMap),
}));

function venue(overrides: Partial<ConsumerVenue> = {}): ConsumerVenue {
  const id = overrides.id ?? "venue-1";
  return {
    id,
    slug: id,
    placeId: `place-${id}`,
    zoneId: "south-end-charlotte",
    name: "Neon Garden",
    address: "100 South End",
    lat: 35.2123,
    lng: -80.859,
    category: "Cocktail bar",
    hidden: false,
    openNow: true,
    signal: {
      venueId: id,
      placeId: `place-${id}`,
      busyness0To100: 68,
      busynessSource: "live",
      mfRatio: 55,
      confidence0To1: 0.8,
      sampleSize: 10,
      computedAt: "2026-06-27T01:00:00.000Z",
      updatedAt: null,
      lastBusynessRefresh: "2026-06-27T01:00:00.000Z",
    },
    ...overrides,
  };
}

function mockFetchWithVenues(venues: ConsumerVenue[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/venues/trending")) {
        return new Response(JSON.stringify({ data: { venues: [] } }), { status: 200 });
      }

      return new Response(JSON.stringify({ data: { venues } }), { status: 200 });
    }),
  );
}

async function renderVenueMap(venues: ConsumerVenue[] = [venue()]) {
  mockFetchWithVenues(venues);
  render(<VenueMap city={DEFAULT_CITY} onCityChange={vi.fn()} />);
  await waitFor(() => expect(markerHandlers.length).toBeGreaterThan(0));
}

async function tapFirstMarker() {
  await act(async () => {
    markerHandlers[0]?.click?.({ type: "click" });
  });
  await screen.findByRole("dialog", { name: /Neon Garden venue popup/i });
}

describe("VenueMap marker popup", () => {
  beforeEach(() => {
    markerHandlers.length = 0;
    push.mockClear();
    vi.useRealTimers();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the map container", async () => {
    await renderVenueMap();

    expect(screen.getByLabelText("Venue map")).toBeTruthy();
    expect(screen.getByTestId("leaflet-map")).toBeTruthy();
  });

  it("shows the popup card with venue name when a marker is tapped", async () => {
    await renderVenueMap();
    await tapFirstMarker();

    expect(screen.getByRole("heading", { name: "Neon Garden" })).toBeTruthy();
  });

  it("hides the popup card when tapping outside or pressing close", async () => {
    const user = userEvent.setup();

    await renderVenueMap();
    await tapFirstMarker();

    await user.click(screen.getByRole("button", { name: "Dismiss venue popup" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Neon Garden venue popup/i })).toBeNull());

    await tapFirstMarker();
    await user.click(screen.getByRole("button", { name: "Close venue popup" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Neon Garden venue popup/i })).toBeNull());
  });

  it("links the popup card View venue action to the venue detail page", async () => {
    await renderVenueMap();
    await tapFirstMarker();

    expect(screen.getByRole("link", { name: "View venue" }).getAttribute("href")).toBe("/venues/venue-1");
  });

  it("renders venue category and open status in the popup card", async () => {
    await renderVenueMap();
    await tapFirstMarker();

    expect(screen.getByText("Cocktail bar")).toBeTruthy();
    expect(screen.getByText("Open now")).toBeTruthy();
  });
});
