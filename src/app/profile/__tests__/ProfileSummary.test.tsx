// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../page";

const {
  mockUseSession,
  mockSignIn,
  mockSignOut,
  mockRefreshSaved,
  mockToggleSaved,
  savedVenuesState,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockRefreshSaved: vi.fn(),
  mockToggleSaved: vi.fn(),
  savedVenuesState: {
    error: null as string | null,
    loading: false,
    savedVenues: [] as Array<{
      venueId: string;
      placeId: string | null;
      alertThreshold: number;
      savedAt: string | null;
      createdAt: string | null;
      currentBusyness: number | null;
      venue: {
        id: string;
        placeId: string;
        name: string;
        category: string;
        photoUrl?: string;
        openNow?: boolean | null;
        open_now?: boolean | null;
        opening_hours?: { open_now?: boolean | null } | null;
      } | null;
    }>,
  },
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

vi.mock("next/image", () => ({
  default: function ImageStub({ alt, src }: { alt: string; src: string }) {
    return <img alt={alt} src={src} />;
  },
}));

vi.mock("@/components/PageTransition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useSavedVenues", () => ({
  SAVED_VENUES_EVENT: "nytchkr:saved-venues-changed",
  useSavedVenues: () => ({
    error: savedVenuesState.error,
    loading: savedVenuesState.loading,
    savedVenues: savedVenuesState.savedVenues,
    refresh: mockRefreshSaved,
    toggle: mockToggleSaved,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: mockUseSession,
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

const session = {
  user: {
    id: "user-123",
    email: "tester@example.com",
    name: "Test Reporter",
  },
};

function mockAuth(nextSession: typeof session | null) {
  mockUseSession.mockReturnValue(
    nextSession
      ? { data: nextSession, status: "authenticated" }
      : { data: null, status: "unauthenticated" },
  );
}

describe("Profile saved spots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedVenuesState.error = null;
    savedVenuesState.loading = false;
    savedVenuesState.savedVenues = [];
    mockRefreshSaved.mockResolvedValue(undefined);
    mockToggleSaved.mockResolvedValue(false);
    mockSignIn.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    mockAuth(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows saved venue cards for signed-in users without check-in stats", async () => {
    mockAuth(session);
    savedVenuesState.savedVenues = [
      {
        venueId: "venue-1",
        placeId: "place-1",
        alertThreshold: 70,
        savedAt: "2026-06-28T00:00:00.000Z",
        createdAt: "2026-06-28T00:00:00.000Z",
        currentBusyness: 72,
        venue: {
          id: "venue-1",
          placeId: "place-1",
          name: "Trio",
          category: "Nightclub",
          photoUrl: "https://example.com/trio.jpg",
          openNow: true,
        },
      },
    ];

    render(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "Your saved spots" })).not.toBeNull();
    expect(screen.getByText("tester@example.com")).not.toBeNull();
    const venueLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/venues/venue-1");
    expect(venueLinks.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Unsave Trio" })).not.toBeNull();
    expect(screen.queryByText("Total Check-ins")).toBeNull();
    expect(screen.queryByText("Current Streak")).toBeNull();
    expect(screen.queryByText("Top Venues")).toBeNull();
  });

  it("unsaves a venue from the saved spots list", async () => {
    mockAuth(session);
    savedVenuesState.savedVenues = [
      {
        venueId: "venue-1",
        placeId: "place-1",
        alertThreshold: 70,
        savedAt: null,
        createdAt: null,
        currentBusyness: null,
        venue: {
          id: "venue-1",
          placeId: "place-1",
          name: "Trio",
          category: "Nightclub",
          openNow: false,
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<ProfilePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Unsave Trio" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/saved-venues", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ venueId: "venue-1" }),
      });
    });
    expect(mockRefreshSaved).toHaveBeenCalled();
  });

  it("shows the saved-spots empty state", async () => {
    mockAuth(session);

    render(<ProfilePage />);

    expect(await screen.findByText("You haven't saved any spots yet. Tap ♡ on a venue to save it.")).not.toBeNull();
  });

  it("shows the email magic-link form for guests", async () => {
    mockAuth(null);

    render(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "Sign in to save your favourite spots" })).not.toBeNull();
    expect(screen.getByText("nytchkr remembers the places you love")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/profile" });
    });
  });

  it("shows a compact sign out action for signed-in users", async () => {
    mockAuth(session);

    render(<ProfilePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(screen.queryByText("Total Check-ins")).toBeNull();
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
