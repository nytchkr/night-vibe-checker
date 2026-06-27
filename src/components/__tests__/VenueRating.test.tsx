// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/hooks/useToast";
import { VenueRating } from "@/components/VenueRating";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/haptics", () => ({
  triggerHapticFeedback: vi.fn(),
}));

function renderVenueRating(props?: Partial<React.ComponentProps<typeof VenueRating>>) {
  render(
    <ToastProvider>
      <VenueRating
        accessToken="token-123"
        userId="user-123"
        venueId="venue-1"
        googleRating={4.6}
        userRatingCount={1234}
        {...props}
      />
    </ToastProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("VenueRating", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: "success",
        data: { averageRating: 4, ratingCount: 2, userRating: 4 },
      }), { status: 200 }),
    ));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the Google average, count, and current user's rating", async () => {
    renderVenueRating();

    expect(await screen.findByText("Google 4.6 · 1,234 ratings")).toBeTruthy();
    await waitFor(() => {
      const fourStarButton = screen.getByRole("button", { name: "Rate 4 stars" });
      expect(fourStarButton.querySelector("svg")?.getAttribute("class")).toContain("fill-current");
    });
  });

  it("submits a 1-5 star rating for authenticated users", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "success",
        data: { averageRating: 4, ratingCount: 2, userRating: null },
      }), { status: 200 }))
      .mockImplementationOnce((_url: string, init?: RequestInit) => jsonResponse({
        status: "success",
        data: { venue_id: "venue-1", user_id: "user-123", rating: 5 },
      }).then((response) => {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ venue_id: "venue-1", user_id: "user-123", rating: 5 }));
        return response;
      }));
    vi.stubGlobal("fetch", fetchMock);

    renderVenueRating();

    await waitFor(() => expect(screen.getByRole("button", { name: "Rate 5 stars" }).hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "Rate 5 stars" }));

    expect(await screen.findByText("Rating saved!")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prompts signed-out users to sign in instead of showing rating controls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      data: { averageRating: 4, ratingCount: 2, userRating: null },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderVenueRating({ accessToken: null, userId: null });

    await screen.findByText("Sign in to rate");
    expect(screen.queryByRole("button", { name: /Rate \d stars?/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
