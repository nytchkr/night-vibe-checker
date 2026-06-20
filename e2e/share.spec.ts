import { expect, test, type Page } from "@playwright/test";

const shareVenue = {
  id: "share-venue-1",
  placeId: "share-place-1",
  zoneId: "south-end",
  name: "Share Test Club",
  address: "789 Share St",
  lat: 35.216,
  lng: -80.858,
  category: "night_club",
  photoUrl: null,
  hidden: false,
  signal: {
    venueId: "share-venue-1",
    placeId: "share-place-1",
    busyness0To100: 77,
    busynessSource: "live",
    mfRatio: 52,
    confidence0To1: 0.74,
    sampleSize: 5,
    computedAt: new Date().toISOString(),
    lastBusynessRefresh: new Date().toISOString(),
  },
};

const meta = {
  cached: true,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-share",
};

async function mockVenueDetail(page: Page) {
  await page.route("**/api/venues/share-venue-1", (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venue: shareVenue },
        meta,
      }),
    });
  });

  await page.route("**/api/check-ins?**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.pathname !== "/api/check-ins") {
      return route.continue();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { checkIns: [] },
        meta,
      }),
    });
  });
}

test.describe("Venue detail share", () => {
  test("shares a venue detail link through native share or clipboard fallback", async ({ page }) => {
    await mockVenueDetail(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("nv_onboarded", "1");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.localStorage.setItem("e2e_copied_url", value);
          },
        },
      });
    });

    await page.goto("/venues/share-venue-1");

    await expect(page.getByRole("heading", { level: 1, name: "Share Test Club" })).toBeVisible();
    const shareButton = page.getByRole("button", { name: "Share vibe report" });
    await expect(shareButton).toBeVisible();

    await shareButton.click();

    // "Link copied!" is in title attribute (tooltip) not visible text; verify clipboard write instead
    await expect(page.evaluate(() => window.localStorage.getItem("e2e_copied_url"))).resolves.toContain(
      "/venues/share-venue-1",
    );
  });
});
