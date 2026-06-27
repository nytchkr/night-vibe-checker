// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../page";

const { mockGetSession, mockOnAuthStateChange, mockPush } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockPush: vi.fn(),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/PageTransition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/OnboardingOverlay", () => ({
  OnboardingOverlay: () => null,
}));

vi.mock("@/lib/push", () => ({
  savePushSubscription: vi.fn(),
  unsubscribeFromPush: vi.fn(),
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
  user: { email: "tester@example.com" },
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

function mockProfileFetch(streakResponse: MockResponse | Promise<MockResponse>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/user/saved-venues") return Promise.resolve(jsonResponse([]));
    if (url === "/api/profile/check-ins") return Promise.resolve(jsonResponse([]));
    if (url === "/api/profile/rewards") return Promise.resolve(jsonResponse({}));
    if (url === "/api/profile/notification-prefs") {
      return Promise.resolve(jsonResponse({ data: { notificationPrefs: {} } }));
    }
    if (url === "/api/user/streak") return Promise.resolve(streakResponse);
    return Promise.resolve(jsonResponse({}));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSignedInProfile(streakResponse: MockResponse | Promise<MockResponse>) {
  mockGetSession.mockResolvedValue({ data: { session } });
  mockOnAuthStateChange.mockReturnValue({
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  });
  mockProfileFetch(streakResponse);
  render(<ProfilePage />);
}

describe("Profile streak badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows N day streak when the API returns streak >= 1", async () => {
    renderSignedInProfile(jsonResponse({ streak: 4, lastCheckinDate: "2026-06-27" }));

    expect(await screen.findByText("4 day streak")).not.toBeNull();
  });

  it("shows a CTA when the API returns streak 0", async () => {
    renderSignedInProfile(jsonResponse({ streak: 0, lastCheckinDate: null }));

    expect(await screen.findByText("Start your streak — check in tonight!")).not.toBeNull();
  });

  it("shows only a loading skeleton while the streak request is pending", async () => {
    renderSignedInProfile(pendingResponse());

    await waitFor(() => {
      expect(screen.getByLabelText("Loading streak")).not.toBeNull();
    });
    expect(screen.queryByText(/day streak/)).toBeNull();
    expect(screen.queryByText("Start your streak — check in tonight!")).toBeNull();
  });

  it("redirects to login when the streak API returns 401", async () => {
    renderSignedInProfile(jsonResponse({ error: { code: "UNAUTHORIZED" } }, 401));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login?return=/profile");
    });
  });

  it("handles 500 gracefully by showing no streak badge", async () => {
    renderSignedInProfile(jsonResponse({ error: { code: "DB_ERROR" } }, 500));

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading streak")).toBeNull();
    });
    expect(screen.queryByText(/day streak/)).toBeNull();
    expect(screen.queryByText("Start your streak — check in tonight!")).toBeNull();
  });
});
