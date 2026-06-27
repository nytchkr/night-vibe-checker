// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VibeCheckHistoryPage from "../history/page";

const { mockCookies, mockFrom, mockGetUser, mockRedirect } = vi.hoisted(() => ({
  mockCookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
  })),
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
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
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

type CheckInFixture = {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  busyness: "dead" | "moderate" | "packed" | null;
  created_at: string;
  venues?: { name?: string | null; address?: string | null } | null;
};

function checkInsQuery(data: CheckInFixture[]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  };

  return query;
}

async function renderHistory() {
  const page = await VibeCheckHistoryPage();
  render(page);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
  mockFrom.mockReturnValue(checkInsQuery([]));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("VibeCheckHistoryPage", () => {
  it("redirects unauthenticated users to /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(VibeCheckHistoryPage()).rejects.toThrow("NEXT_REDIRECT:/login?return=/vibe-check/history");

    expect(mockRedirect).toHaveBeenCalledWith("/login?return=/vibe-check/history");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("shows a list of check-ins with venue name and time-ago", async () => {
    const query = checkInsQuery([
      {
        id: "check-in-1",
        venue_id: "venue-1",
        user_id: "user-123",
        busyness: "packed",
        created_at: "2026-06-27T10:00:00.000Z",
        venues: { name: "Trio", address: "820 Hamilton St" },
      },
      {
        id: "check-in-2",
        venue_id: "venue-2",
        user_id: "user-123",
        busyness: "moderate",
        created_at: "2026-06-26T12:00:00.000Z",
        venues: { name: "Lost & Found", address: "332 W Bland St" },
      },
    ]);
    mockFrom.mockReturnValue(query);

    await renderHistory();

    expect(screen.getByRole("heading", { name: "Trio" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lost & Found" })).not.toBeNull();
    expect(screen.getByText("2 hours ago")).not.toBeNull();
    expect(screen.getByText("1 day ago")).not.toBeNull();
    expect(mockFrom).toHaveBeenCalledWith("check_ins");
    expect(query.select).toHaveBeenCalledWith("*, venues!inner(name,address)");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(50);
  });

  it("shows empty state with link to /explore when no check-ins", async () => {
    await renderHistory();

    expect(screen.getByRole("heading", { name: "No check-ins yet — find somewhere to go tonight!" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Explore venues" }).getAttribute("href")).toBe("/explore");
  });

  it("shows busyness badge on check-in cards", async () => {
    mockFrom.mockReturnValue(checkInsQuery([
      {
        id: "packed-check-in",
        venue_id: "venue-packed",
        user_id: "user-123",
        busyness: "packed",
        created_at: "2026-06-27T11:55:00.000Z",
        venues: { name: "Packed Room", address: "100 Camden Rd" },
      },
      {
        id: "moderate-check-in",
        venue_id: "venue-moderate",
        user_id: "user-123",
        busyness: "moderate",
        created_at: "2026-06-27T11:45:00.000Z",
        venues: { name: "Middle Bar", address: "101 Camden Rd" },
      },
      {
        id: "dead-check-in",
        venue_id: "venue-dead",
        user_id: "user-123",
        busyness: "dead",
        created_at: "2026-06-27T11:30:00.000Z",
        venues: { name: "Quiet Corner", address: "102 Camden Rd" },
      },
    ]));

    await renderHistory();

    const packedCard = screen.getByRole("heading", { name: "Packed Room" }).closest("li");
    const moderateCard = screen.getByRole("heading", { name: "Middle Bar" }).closest("li");
    const quietCard = screen.getByRole("heading", { name: "Quiet Corner" }).closest("li");

    expect(packedCard).not.toBeNull();
    expect(moderateCard).not.toBeNull();
    expect(quietCard).not.toBeNull();
    expect(within(packedCard as HTMLElement).getByText("Packed")).not.toBeNull();
    expect(within(moderateCard as HTMLElement).getByText("Moderate")).not.toBeNull();
    expect(within(quietCard as HTMLElement).getByText("Quiet")).not.toBeNull();
  });
});
