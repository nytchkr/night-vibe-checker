// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ToastProvider";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "../VenuePageClient";

const authMock = vi.hoisted(() => ({
  session: null as null | {
    access_token: string;
    user: { id: string };
  },
  liveCheckInCount: 0,
}));

const supabaseMocks = vi.hoisted(() => {
  const removeChannel = vi.fn();
  const channel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  } = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return { channel, removeChannel };
});

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: function ImageStub(props: React.ImgHTMLAttributes<HTMLImageElement>) {
      return React.createElement("img", props);
    },
  };
});

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
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/components/BusynessMeter", () => ({
  BusynessMeter: () => <div data-testid="busyness-meter" />,
}));

vi.mock("@/components/CategoryBadge", () => ({
  CategoryBadge: ({ category }: { category: string }) => <span>{category}</span>,
  PriceLevelDisplay: () => <span>$$</span>,
}));

vi.mock("@/components/CheckInButton", () => ({
  CheckInButton: () => <button type="button">Report the vibe</button>,
}));

vi.mock("@/components/MFRatioBar", () => ({
  MFRatioBar: () => <div data-testid="mf-ratio" />,
  getMFRatioPercents: () => ({ malePercent: 50, femalePercent: 50 }),
}));

vi.mock("@/components/OpenNowBadge", () => ({
  OpenNowBadge: () => <span>Open now</span>,
}));

vi.mock("@/components/OnboardingGate", () => ({
  useOnboardingGate: () => ({
    consumePendingAction: vi.fn(() => false),
    requireAuth: vi.fn(),
  }),
}));

vi.mock("@/components/PushOptIn", () => ({
  PushOptIn: () => null,
}));

vi.mock("@/components/SaveButton", () => ({
  SaveButton: () => <button type="button">Save</button>,
}));

vi.mock("@/components/ShareButton", () => ({
  ShareButton: ({
    children,
    venueId: _venueId,
    venueName: _venueName,
    ...props
  }: {
    children: React.ReactNode;
    venueId?: string;
    venueName?: string;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock("@/components/SignalFreshnessLabel", () => ({
  SignalFreshnessLabel: () => null,
}));

vi.mock("@/components/SkeletonVenueDetail", () => ({
  SkeletonVenueDetail: () => <div>Loading venue</div>,
}));

vi.mock("@/components/StarRating", () => ({
  StarRating: () => <div data-testid="google-stars" />,
}));

vi.mock("@/components/Toast", () => ({
  Toast: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/TrendingBadge", () => ({
  TrendingBadge: () => null,
}));

vi.mock("@/components/VenuePredictionCard", () => ({
  VenuePredictionCard: () => null,
}));

vi.mock("@/components/VenuePhoto", () => ({
  VenuePhoto: ({ name }: { name: string }) => <div aria-label={`${name} photo`} />,
}));

vi.mock("@/components/VenueTips", () => ({
  VenueTips: () => null,
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock("@/hooks/useHaptic", () => ({
  useHaptic: () => ({
    light: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/haptics", () => ({
  triggerHapticFeedback: vi.fn(),
}));

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: authMock.session } })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
    from: vi.fn(() => {
      const query: {
        select: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        gte: ReturnType<typeof vi.fn>;
      } = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
      };

      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.gte.mockResolvedValue({ count: authMock.liveCheckInCount, error: null });

      return query;
    }),
    channel: vi.fn(() => supabaseMocks.channel),
    removeChannel: supabaseMocks.removeChannel,
  }),
}));

vi.mock("@/lib/clientTrendingVenueIds", () => ({
  fetchTrendingVenueIds: vi.fn(() => Promise.resolve(new Set<string>())),
}));

function makeVenue(overrides: Partial<ConsumerVenue> = {}): ConsumerVenue {
  return {
    id: "venue-1",
    placeId: "place-venue-1",
    zoneId: "south-end-charlotte",
    name: "Neon Lounge",
    address: "100 Camden Rd, Charlotte, NC",
    lat: 35.2123,
    lng: -80.859,
    neighborhood: "South End",
    category: "bar",
    rating: 4.4,
    googleRating: 4.4,
    userRatingCount: 120,
    priceLevel: 2,
    openNow: true,
    current_popularity: null,
    vibe_score: null,
    trending: false,
    hidden: false,
    signal: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function mockVenuePageFetch(userRating: number | null = null) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    if (url === "/api/venue-ratings" && init?.method === "POST") {
      return jsonResponse({
        status: "success",
        data: { venue_id: "venue-1", user_id: "user-123", rating: 5 },
      });
    }

    if (url.startsWith("/api/venue-ratings?")) {
      return jsonResponse({
        status: "success",
        data: { averageRating: 4.2, ratingCount: 7, userRating },
      });
    }

    if (url.includes("/activity")) {
      return jsonResponse({ data: { activity: [] } });
    }

    if (url.includes("/check-ins")) {
      return jsonResponse({ data: { checkIns: [] } });
    }

    if (url.includes("/photos")) {
      return jsonResponse({ photos: [] });
    }

    if (url.startsWith("/api/venues/")) {
      return jsonResponse({ data: { venue: makeVenue() } });
    }

    return jsonResponse({});
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderVenuePage(venue: ConsumerVenue = makeVenue()) {
  render(
    <ToastProvider>
      <VenuePageClient
        venueId={venue.id}
        initialVenue={venue}
        initialLiveCheckInCount={authMock.liveCheckInCount}
      />
    </ToastProvider>,
  );
}

async function findStarButtons() {
  return screen.findAllByRole("button", { name: /Rate \d stars?/ });
}

describe("VenuePageClient venue rating widget", () => {
  beforeEach(() => {
    authMock.session = {
      access_token: "token-123",
      user: { id: "user-123" },
    };
    authMock.liveCheckInCount = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders 5 star buttons for an authenticated user", async () => {
    mockVenuePageFetch();
    renderVenuePage();

    expect(await findStarButtons()).toHaveLength(5);
  });

  it("renders the server-seeded live check-in count badge", async () => {
    authMock.liveCheckInCount = 3;
    mockVenuePageFetch();
    renderVenuePage();

    expect(await screen.findByText("3 here tonight")).toBeTruthy();
  });

  it("shows the existing user rating as filled stars", async () => {
    mockVenuePageFetch(3);
    renderVenuePage();

    const starButtons = await findStarButtons();

    await waitFor(() => {
      expect(starButtons[0].querySelector("svg")?.getAttribute("class")).toContain("fill-current");
      expect(starButtons[1].querySelector("svg")?.getAttribute("class")).toContain("fill-current");
      expect(starButtons[2].querySelector("svg")?.getAttribute("class")).toContain("fill-current");
      expect(starButtons[3].querySelector("svg")?.getAttribute("class")).not.toContain("fill-current");
    });
  });

  it("submitting a rating calls POST /api/venue-ratings with the correct payload", async () => {
    const fetchMock = mockVenuePageFetch();
    renderVenuePage();

    await userEvent.click((await findStarButtons())[4]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/venue-ratings", expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ venue_id: "venue-1", user_id: "user-123", rating: 5 }),
      }));
    });
  });

  it("shows a Rating saved! toast after a successful rating", async () => {
    mockVenuePageFetch();
    renderVenuePage();

    await userEvent.click((await findStarButtons())[4]);

    expect(await screen.findByText("Rating saved!")).toBeTruthy();
  });

  it("shows a sign-in prompt with no star buttons for an unauthenticated user", async () => {
    authMock.session = null;
    mockVenuePageFetch();
    renderVenuePage();

    expect(await screen.findByText("Sign in to rate")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /Rate \d stars?/ })).toHaveLength(0);
  });
});
