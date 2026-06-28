// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../page";

const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock("next/link", async () => {
  const ReactModule = await import("react");
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
      return ReactModule.createElement("a", { href, ...props }, children);
    },
  };
});

vi.mock("@/components/PageTransition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/OnboardingOverlay", () => ({
  OnboardingOverlay: () => null,
}));

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const session = {
  access_token: "token-123",
  user: {
    id: "user-123",
    email: "tester@example.com",
    user_metadata: { full_name: "Test Reporter" },
  },
};

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function pendingResponse(): Promise<MockResponse> {
  return new Promise(() => undefined);
}

function mockProfileFetch(profileResponse: MockResponse | Promise<MockResponse>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === "/api/user/profile") return Promise.resolve(profileResponse);
    return Promise.resolve(jsonResponse({}));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSignedInProfile(profileResponse: MockResponse | Promise<MockResponse>) {
  mockGetSession.mockResolvedValue({ data: { session } });
  mockOnAuthStateChange.mockReturnValue({
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  });
  return {
    fetchMock: mockProfileFetch(profileResponse),
    ...render(<ProfilePage />),
  };
}

describe("Profile summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fetches /api/user/profile with the bearer token and renders profile stats", async () => {
    const { fetchMock } = renderSignedInProfile(jsonResponse({
      userId: "user-123",
      totalCheckIns: 12,
      uniqueVenues: 5,
      streak: 4,
      topVenues: [
        { venueId: "venue-1", venueName: "Trio", checkInCount: 7 },
        { venueId: "venue-2", venueName: "Slate", checkInCount: 3 },
        { venueId: "venue-3", venueName: "Vinyl", checkInCount: 2 },
      ],
    }));

    expect(await screen.findByText("Test Reporter")).not.toBeNull();
    expect(screen.getByText("tester@example.com")).not.toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/user/profile", {
        headers: { Authorization: "Bearer token-123" },
        cache: "no-store",
      });
    });

    const stats = screen.getByLabelText("Profile stats");
    expect(within(stats).getByText("Total Check-ins")).not.toBeNull();
    expect(within(stats).getByText("12")).not.toBeNull();
    expect(within(stats).getByText("Unique Venues")).not.toBeNull();
    expect(within(stats).getByText("5")).not.toBeNull();
    expect(within(stats).getByText("Current Streak")).not.toBeNull();
    expect(within(stats).getByText("4")).not.toBeNull();
    expect(within(stats).getByText("Top Venue")).not.toBeNull();
    expect(within(stats).getByText("Trio")).not.toBeNull();

    const topVenues = screen.getByLabelText("Top Venues");
    expect(within(topVenues).getByText("Trio")).not.toBeNull();
    expect(within(topVenues).getByText("Slate")).not.toBeNull();
    expect(within(topVenues).getByText("Vinyl")).not.toBeNull();
    expect(within(topVenues).getByText("7")).not.toBeNull();
  });

  it("shows the requested empty state when the user has no check-ins", async () => {
    renderSignedInProfile(jsonResponse({
      userId: "user-123",
      totalCheckIns: 0,
      uniqueVenues: 0,
      streak: 0,
      topVenues: [],
    }));

    expect(await screen.findByText("Start exploring and check in to see your stats")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Explore spots" }).getAttribute("href")).toBe("/explore");
  });

  it("shows three skeleton cards while profile summary is loading", async () => {
    renderSignedInProfile(pendingResponse());

    expect(await screen.findByLabelText("Loading profile")).not.toBeNull();
    expect(screen.queryByText("Start exploring and check in to see your stats")).toBeNull();
  });

  it("shows the logged-out profile pitch for guests", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn());

    render(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "Know before you go." })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue with Google" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Or sign in with email" }).getAttribute("href")).toBe("/login?return=/profile");
  });
});
