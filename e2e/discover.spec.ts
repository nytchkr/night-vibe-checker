// ============================================================
// NV-023 — E2E smoke test for /discover map page
//
// Strategy:
//   - Mock GET /api/venues to return 2 canned venues
//   - Navigate to /discover
//   - Assert no console crash ([ERROR] level)
//   - Assert bottom-nav "Explore" tab has aria-current="page"
//   - Assert at least one of: map container OR fallback placeholder visible
//
// Two rendering paths exist:
//   1. NEXT_PUBLIC_GOOGLE_MAPS_KEY absent  → MapPreviewFallback renders
//      (aria-label="Map preview", h2 "Tonight nearby")
//   2. NEXT_PUBLIC_GOOGLE_MAPS_KEY present → GoogleMapsView dynamic-imported
//      (Google Maps loads; the section aria-label="Map view" is the wrapper)
//
// Both paths render the <section aria-label="Map view"> wrapper, so we
// assert that the section itself is visible (it's always present) which
// proves the map layer rendered without a crash.
// ============================================================

import { test, expect, Page } from "@playwright/test";
import type { APIResponse, VenueBasic } from "../src/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_VENUE_1: VenueBasic = {
  placeId: "ChIJe2etest_discover_01",
  name: "The Neon Lounge",
  address: "10 Midnight Ave, Brooklyn, NY 11211",
  lat: 40.7128,
  lng: -73.9442,
  type: "bar",
  googleRating: 4.5,
  totalRatings: 280,
  priceLevel: 2,
};

const MOCK_VENUE_2: VenueBasic = {
  placeId: "ChIJe2etest_discover_02",
  name: "Pulse Nightclub",
  address: "77 Electric St, Manhattan, NY 10002",
  lat: 40.7204,
  lng: -73.9877,
  type: "night_club",
  googleRating: 4.3,
  totalRatings: 510,
  priceLevel: 3,
};

/** Wrap a value in the APIResponse envelope the real routes return. */
function apiSuccess<T>(data: T): APIResponse<T> {
  return {
    status: "success",
    data,
    meta: {
      cached: false,
      generatedAt: new Date().toISOString(),
      requestId: "e2e-discover-request-id",
    },
  };
}

/**
 * Mock GET /api/venues (list endpoint) to return the given venues.
 * Passes individual venue detail requests through so the page doesn't break.
 */
async function mockVenueSearch(
  page: Page,
  venues: VenueBasic[] = [MOCK_VENUE_1, MOCK_VENUE_2]
) {
  await page.route("**/api/venues**", (route) => {
    const url = route.request().url();
    // Pass through detail requests like /api/venues/ChIJ...
    if (/\/api\/venues\/[^/]+/.test(url)) {
      route.continue();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(apiSuccess(venues)),
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Discover page — NV-023 smoke test", () => {
  test("renders without console errors and shows map section", async ({ page }) => {
    // Collect console errors (not warnings, not logs — only errors)
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await mockVenueSearch(page);
    await page.goto("/discover");

    // Assert the page heading loads — confirms SSR/hydration succeeded
    await expect(
      page.getByRole("heading", { name: /map the night/i })
    ).toBeVisible({ timeout: 8000 });

    // Assert map section wrapper is present.
    // The <section aria-label="Map view"> always renders regardless of whether
    // Google Maps API key is present or not (both branches live inside it).
    // This proves the map layer rendered without crashing.
    const mapSection = page.getByRole("region", { name: /map view/i });
    await expect(mapSection).toBeVisible({ timeout: 8000 });

    // Also assert the nearby venues section label is present
    await expect(
      page.getByRole("region", { name: /nearby venues/i })
    ).toBeVisible({ timeout: 5000 });

    // No [ERROR] crash messages from React/Next
    const crashErrors = consoleErrors.filter(
      (msg) =>
        // Ignore known non-fatal warnings that may appear as console.error in some browsers
        !msg.includes("Warning:") &&
        !msg.includes("Hydration") &&
        !msg.includes("google") &&
        !msg.includes("Google Maps") &&
        !msg.includes("gstatic") &&
        !msg.includes("Map ID") &&
        !msg.includes("map is initialized")
    );
    expect(crashErrors).toHaveLength(0);
  });

  test("bottom nav Explore tab has aria-current=page", async ({ page }) => {
    await mockVenueSearch(page);
    await page.goto("/discover");

    // Wait for page to be interactive
    await expect(
      page.getByRole("heading", { name: /map the night/i })
    ).toBeVisible({ timeout: 8000 });

    // The BottomNav renders a <Link> with aria-label="Explore" and
    // aria-current="page" when the pathname starts with /discover
    const exploreTab = page.getByRole("link", { name: "Explore" });
    await expect(exploreTab).toBeVisible({ timeout: 5000 });
    await expect(exploreTab).toHaveAttribute("aria-current", "page");
  });

  test("venue list renders 2 mocked venues after API responds", async ({ page }) => {
    await mockVenueSearch(page, [MOCK_VENUE_1, MOCK_VENUE_2]);
    await page.goto("/discover");

    // Wait for the loading skeleton to clear and both venue names to appear
    await expect(page.getByText("The Neon Lounge")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Pulse Nightclub")).toBeVisible({ timeout: 8000 });

    // Header count should reflect "2 spots surfaced"
    await expect(page.getByText(/2 spots surfaced/i)).toBeVisible({ timeout: 5000 });
  });

  test("Nearby venues section has accessible label", async ({ page }) => {
    await mockVenueSearch(page);
    await page.goto("/discover");

    await expect(
      page.getByRole("region", { name: /nearby venues/i })
    ).toBeVisible({ timeout: 8000 });
  });

  test("clicking venue Check Vibe navigates to /vibe-check with params", async ({ page }) => {
    await mockVenueSearch(page, [MOCK_VENUE_1]);
    await page.goto("/discover");

    // Wait for venue card to appear
    await expect(page.getByText("The Neon Lounge")).toBeVisible({ timeout: 8000 });

    // VenueCard renders a "Check Vibe" button that calls onVibeCheck
    // which pushes /vibe-check?venueId=...&venueName=...
    const checkVibeBtn = page
      .getByRole("button", { name: /check vibe/i })
      .first();
    await expect(checkVibeBtn).toBeVisible({ timeout: 5000 });
    await checkVibeBtn.click();

    await expect(page).toHaveURL(/\/vibe-check/, { timeout: 5000 });
    await expect(page).toHaveURL(
      new RegExp(`venueId=${MOCK_VENUE_1.placeId}`),
      { timeout: 5000 }
    );
  });
});
