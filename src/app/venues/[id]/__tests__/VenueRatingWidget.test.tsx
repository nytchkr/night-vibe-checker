// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerVenue } from "@/types";
import { VenuePageClient } from "../VenuePageClient";

vi.mock("next/dynamic", async () => {
  const { createElement } = await import("react");

  return {
    default: () => {
      return function DynamicStub(props: Record<string, unknown>) {
        return createElement("section", { "aria-label": "Venue tips" }, [
          createElement("h2", { key: "title" }, String(props.title ?? "")),
          createElement("p", { key: "subtitle" }, String(props.subtitle ?? "")),
          createElement("p", { key: "maxTips" }, `${String(props.maxTips ?? "")} tips`),
        ]);
      };
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

vi.mock("@/components/BusynessForecast", () => ({
  BusynessForecast: () => <section aria-label="Hourly busyness forecast">Forecast</section>,
}));

vi.mock("@/components/BusynessMeter", () => ({
  BusynessMeter: () => <div data-testid="busyness-meter" />,
}));

vi.mock("@/components/CategoryBadge", () => ({
  CategoryBadge: ({ category }: { category: string }) => <span>{category}</span>,
  PriceLevelDisplay: ({ priceLevel }: { priceLevel?: number | null }) => (
    priceLevel ? <span>{"$".repeat(priceLevel)}</span> : null
  ),
}));

vi.mock("@/components/OpenNowBadge", () => ({
  OpenNowBadge: ({ openNow }: { openNow?: boolean | null }) => (
    <span>{openNow === false ? "Closed" : openNow === true ? "Open" : "Hours unknown"}</span>
  ),
}));

vi.mock("@/components/SaveButton", () => ({
  SaveButton: ({
    children,
    "aria-label": ariaLabel,
    ariaLabel: explicitAriaLabel,
  }: {
    children?: React.ReactNode;
    "aria-label"?: string;
    ariaLabel?: string;
  }) => <button type="button" aria-label={explicitAriaLabel ?? ariaLabel ?? "Save venue"}>{children ?? "Save"}</button>,
}));

vi.mock("@/components/ShareButton", () => ({
  ShareButton: ({
    children,
    venueId: _venueId,
    venueName: _venueName,
    ...props
  }: {
    children?: React.ReactNode;
    venueId?: string;
    venueName?: string;
    [key: string]: unknown;
  }) => <button type="button" {...props}>{children ?? "Share"}</button>,
}));

vi.mock("@/components/SkeletonVenueDetail", () => ({
  SkeletonVenueDetail: () => <div>Loading venue</div>,
}));

vi.mock("@/components/StarRating", () => ({
  StarRating: () => <div data-testid="google-stars">4.4 (120)</div>,
}));

vi.mock("@/components/Toast", () => ({
  Toast: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("@/components/VenuePhoto", () => ({
  VenuePhoto: ({ name }: { name: string }) => <div aria-label={`${name} photo`} />,
}));

vi.mock("@/components/VenueTips", () => ({
  VenueTips: ({
    title,
    subtitle,
    maxTips,
  }: {
    title?: string;
    subtitle?: string;
    maxTips?: number;
  }) => (
    <section aria-label="Venue tips">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <p>{maxTips} tips</p>
    </section>
  ),
}));

vi.mock("@/hooks/useHaptic", () => ({
  useHaptic: () => ({
    light: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
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
    totalRatings: 120,
    priceLevel: 2,
    openNow: true,
    current_popularity: null,
    vibe_score: null,
    trending: false,
    hidden: false,
    signal: {
      venueId: "venue-1",
      placeId: "place-venue-1",
      busyness0To100: 42,
      busynessSource: "forecast",
      mfRatio: null,
      confidence0To1: 0.7,
      sampleSize: 0,
      computedAt: "2026-06-28T04:00:00.000Z",
      updatedAt: "2026-06-28T04:00:00.000Z",
      lastBusynessRefresh: "2026-06-28T04:00:00.000Z",
    },
    ...overrides,
  };
}

function renderVenuePage(venue: ConsumerVenue = makeVenue()) {
  render(
    <VenuePageClient
      venueId={venue.id}
      initialVenue={venue}
      initialLiveCheckInCount={0}
    />,
  );
}

describe("VenuePageClient decision layout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders a linear decision page without tabs, check-in, report, or user rating controls", () => {
    renderVenuePage();

    expect(screen.getByRole("heading", { name: "Neon Lounge" })).toBeTruthy();
    expect(screen.getByLabelText("Decision block")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: /Report the vibe/i })).toBeNull();
    expect(screen.queryByText(/Sign in to rate/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Rate \d stars?/i })).toBeNull();
  });

  it("shows the current busyness badge, source chip, forecast, and good-time hint", () => {
    renderVenuePage();

    expect(screen.getByText("QUIET")).toBeTruthy();
    expect(screen.getByText("FORECAST")).toBeTruthy();
    expect(screen.getByTestId("busyness-meter")).toBeTruthy();
    expect(screen.getByLabelText("Hourly busyness forecast")).toBeTruthy();
    expect(screen.getByText("Not too crowded right now")).toBeTruthy();
  });

  it("shows closed when the venue is not open", () => {
    renderVenuePage(makeVenue({ openNow: false }));

    expect(screen.getByText("CLOSED")).toBeTruthy();
    expect(screen.queryByText("Not too crowded right now")).toBeNull();
  });

  it("renders the facts section with hours, address, price, Google rating, phone, and website", async () => {
    renderVenuePage(makeVenue({
      phoneNumber: "(704) 555-1212",
      website: "https://example.com",
      openingHours: [
        "Monday: 5:00 PM - 2:00 AM",
        "Tuesday: 5:00 PM - 2:00 AM",
        "Wednesday: 5:00 PM - 2:00 AM",
        "Thursday: 5:00 PM - 2:00 AM",
        "Friday: 5:00 PM - 2:00 AM",
        "Saturday: 5:00 PM - 2:00 AM",
        "Sunday: 5:00 PM - 2:00 AM",
      ],
    }));

    expect(screen.getByRole("heading", { name: "The facts" })).toBeTruthy();
    expect(screen.getAllByText("100 Camden Rd, Charlotte, NC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$$").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("google-stars")).toBeTruthy();
    expect(screen.getByText("(704) 555-1212")).toBeTruthy();
    expect(screen.getByText("Open website")).toBeTruthy();

    const hoursButton = screen.getByRole("button", { name: /Open now/i });
    await userEvent.click(hoursButton);
    expect(hoursButton.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders local tips and full-width save/share actions", async () => {
    renderVenuePage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "What locals say" })).toBeTruthy();
    });
    expect(screen.getByText("AI-organized tips from real review text.")).toBeTruthy();
    expect(screen.getByText("3 tips")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Save venue" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Save this place")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });
});
