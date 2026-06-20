import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const venue = {
  id: "nv-test-004-packed-venue",
  placeId: "place-nv-test-004-packed-venue",
  zoneId: "south-end-charlotte",
  name: "Signal Room",
  address: "https://maps.google.com/?q=Signal+Room+Charlotte",
  lat: 35.216,
  lng: -80.858,
  category: "night_club",
  googleRating: 4.6,
  totalRatings: 214,
  priceLevel: 2,
  photoUrl: null,
  hidden: false,
  openNow: true,
  signal: {
    venueId: "nv-test-004-packed-venue",
    placeId: "place-nv-test-004-packed-venue",
    busyness0To100: 84,
    busynessSource: "crowd",
    mfRatio: 65,
    confidence0To1: 0.82,
    sampleSize: 7,
    computedAt: generatedAt,
    lastBusynessRefresh: generatedAt,
  },
};

const meta = {
  cached: true,
  generatedAt,
  requestId: "nv-test-004-venue-detail",
};

async function mockVenueApis(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });

  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") return route.continue();

    if (url.pathname === "/api/venues") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venues: [venue] },
          meta,
        }),
      });
    }

    if (url.pathname === `/api/venues/${venue.id}`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venue },
          meta,
        }),
      });
    }

    return route.continue();
  });

  await page.route("**/api/check-ins**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET" || url.pathname !== "/api/check-ins") {
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

test.describe("NV-TEST-004 venue detail", () => {
  test("clicking a venue card navigates to the venue detail page", async ({ page }) => {
    await mockVenueApis(page);

    await page.goto("/explore");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("link", { name: `Open ${venue.name}` }).click();

    await expect(page).toHaveURL(`/venues/${venue.id}`);
    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
  });

  test("venue detail page shows packed busyness and the M/F ratio bar", async ({ page }) => {
    await mockVenueApis(page);

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    await expect(page.getByText("Packed").first()).toBeVisible();
    await expect(page.getByRole("img", { name: "65% male, 35% female" })).toBeVisible();
  });

  test("venue detail page exposes the share button without invoking share", async ({ page }) => {
    await mockVenueApis(page);

    await page.goto(`/venues/${venue.id}`);

    // ShareButton uses aria-label="Share vibe report" (not venue name)
    await expect(page.getByRole("button", { name: /Share/i })).toBeVisible();
  });

  test("venue detail page has a Google Maps directions link", async ({ page }) => {
    await mockVenueApis(page);

    await page.goto(`/venues/${venue.id}`);

    const directions = page.getByRole("link", { name: /Get Directions|Google Maps/i });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute("href", /maps\.google\.com/);
  });
});
