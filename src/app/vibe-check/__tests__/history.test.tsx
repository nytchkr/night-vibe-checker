// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VibeCheckHistoryPage from "../history/page";

const { mockCookies, mockHeaders, mockFrom, mockGetUser, mockGetSession, mockRedirect } = vi.hoisted(() => ({
  mockCookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
  })),
  mockHeaders: vi.fn(async () => new Headers({ host: "localhost:3000" })),
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
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

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
    from: mockFrom,
  })),
}));

type CheckInFixture = {
  id: string;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  busyness: "dead" | "moderate" | "packed" | null;
  createdAt: string;
};

async function renderHistory() {
  const page = await VibeCheckHistoryPage();
  render(page);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "access-token" } }, error: null });
  vi.stubGlobal("fetch", vi.fn(async () => apiResponse([])));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VibeCheckHistoryPage", () => {
  it("redirects unauthenticated users to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(VibeCheckHistoryPage()).rejects.toThrow("NEXT_REDIRECT:/login?return=/vibe-check/history");

    expect(mockRedirect).toHaveBeenCalledWith("/login?return=/vibe-check/history");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a list of check-ins with venue name and time-ago", async () => {
    vi.mocked(fetch).mockResolvedValue(apiResponse([
      {
        id: "check-in-1",
        venueId: "venue-1",
        venueName: "Trio",
        venueAddress: "820 Hamilton St",
        busyness: "packed",
        createdAt: "2026-06-27T10:00:00.000Z",
      },
      {
        id: "check-in-2",
        venueId: "venue-2",
        venueName: "Lost & Found",
        venueAddress: "332 W Bland St",
        busyness: "moderate",
        createdAt: "2026-06-26T12:00:00.000Z",
      },
    ]));

    await renderHistory();

    expect(screen.getByRole("link", { name: "Trio" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Lost & Found" })).not.toBeNull();
    expect(screen.getByText(/Jun 27/)).not.toBeNull();
    expect(screen.getByText(/Jun 26/)).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/api/user/check-ins", {
      headers: { Authorization: "Bearer access-token" },
      cache: "no-store",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("shows empty state with link to /explore when no check-ins", async () => {
    await renderHistory();

    expect(screen.getByRole("heading", { name: "No check-ins yet" })).not.toBeNull();
    expect(screen.getByText("Find somewhere to go tonight and check in when you arrive.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Explore venues" }).getAttribute("href")).toBe("/explore");
  });

  it("shows busyness badge on check-in cards", async () => {
    vi.mocked(fetch).mockResolvedValue(apiResponse([
      {
        id: "packed-check-in",
        venueId: "venue-packed",
        venueName: "Packed Room",
        venueAddress: "100 Camden Rd",
        busyness: "packed",
        createdAt: "2026-06-27T11:55:00.000Z",
      },
      {
        id: "moderate-check-in",
        venueId: "venue-moderate",
        venueName: "Middle Bar",
        venueAddress: "101 Camden Rd",
        busyness: "moderate",
        createdAt: "2026-06-27T11:45:00.000Z",
      },
      {
        id: "dead-check-in",
        venueId: "venue-dead",
        venueName: "Quiet Corner",
        venueAddress: "102 Camden Rd",
        busyness: "dead",
        createdAt: "2026-06-27T11:30:00.000Z",
      },
    ]));

    await renderHistory();

    const packedCard = screen.getByRole("link", { name: "Packed Room" }).closest("li");
    const moderateCard = screen.getByRole("link", { name: "Middle Bar" }).closest("li");
    const quietCard = screen.getByRole("link", { name: "Quiet Corner" }).closest("li");

    expect(packedCard).not.toBeNull();
    expect(moderateCard).not.toBeNull();
    expect(quietCard).not.toBeNull();
    expect(within(packedCard as HTMLElement).getByText("Packed")).not.toBeNull();
    expect(within(moderateCard as HTMLElement).getByText("Moderate")).not.toBeNull();
    expect(within(quietCard as HTMLElement).getByText("Quiet")).not.toBeNull();
  });
});

function apiResponse(checkIns: CheckInFixture[], init?: ResponseInit): Response {
  return new Response(JSON.stringify({ data: { checkIns }, nextCursor: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
