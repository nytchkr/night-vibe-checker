import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const venue = {
  id: "saved-venue-visible-1",
  placeId: "place-saved-venue-visible-1",
  zoneId: "south-end",
  name: "Bookmark Test Lounge",
  address: "515 Save Ave",
  lat: 35.216,
  lng: -80.86,
  category: "bar",
  photoUrl: null,
  openNow: true,
  hidden: false,
  signal: {
    venueId: "saved-venue-visible-1",
    placeId: "place-saved-venue-visible-1",
    busyness0To100: 58,
    busynessSource: "forecast",
    mfRatio: 50,
    confidence0To1: 0.72,
    sampleSize: 6,
    computedAt: generatedAt,
    lastBusynessRefresh: generatedAt,
  },
};

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

async function mockVenues(page: Page) {
  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET" || url.pathname !== "/api/venues") {
      return route.continue();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [venue] },
        meta: {
          cached: true,
          generatedAt,
          requestId: "e2e-saved-venues",
        },
      }),
    });
  });
}

test.describe("Saved venues", () => {
  test("GET /api/saved-venues returns 401 for unauthenticated request", async ({ request }) => {
    const response = await request.get("/api/saved-venues");

    expect(response.status()).toBe(401);
  });

  test("save venue button is visible on explore page venue cards", async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);

    await page.goto("/explore");

    await expect(page.getByText("Bookmark Test Lounge")).toBeVisible();
    await expect(page.getByRole("button", { name: /Save Bookmark Test Lounge/i })).toBeVisible();
  });

  test("You tab shows pitch card for logged-out user", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("Your Night Out HQ")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign up free/i })).toBeVisible();
  });
});
