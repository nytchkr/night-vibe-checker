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

  test("venue cards appear in explore feed and link to detail pages", async ({ page }) => {
    // Save (heart) button is on venue detail page — explore cards link to detail.
    await markOnboarded(page);
    await mockVenues(page);

    await page.goto("/explore");
    await expect(page.getByText("Bookmark Test Lounge")).toBeVisible();
    const cardLink = page.getByRole("link", { name: /Open Bookmark Test Lounge/i });
    await expect(cardLink).toBeVisible();
    await expect(cardLink).toHaveAttribute("href", /\/venues\//);
  });

  test("Saved tab shows email sign-in for logged-out users", async ({ page }) => {
    await markOnboarded(page);
    await page.goto("/saved");

    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByRole("heading", { name: "Sign in to save venues" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  });
});
