import { expect, test, type Page } from "@playwright/test";

const meta = {
  cached: true,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-filters",
};

const venues = [
  {
    id: "venue-filter-1",
    placeId: "place-filter-1",
    zoneId: "south-end",
    name: "Trio Nightclub",
    address: "101 Filter Ave",
    lat: 35.211,
    lng: -80.861,
    category: "night_club",
    photoUrl: null,
    hidden: false,
    signal: {
      venueId: "venue-filter-1",
      placeId: "place-filter-1",
      busyness0To100: 84,
      busynessSource: "live",
      mfRatio: 51,
      confidence0To1: 0.82,
      sampleSize: 12,
      computedAt: new Date().toISOString(),
      lastBusynessRefresh: new Date().toISOString(),
    },
  },
  {
    id: "venue-filter-2",
    placeId: "place-filter-2",
    zoneId: "south-end",
    name: "Vinyl Lounge",
    address: "202 Filter Ave",
    lat: 35.212,
    lng: -80.862,
    category: "bar",
    photoUrl: null,
    hidden: false,
    signal: {
      venueId: "venue-filter-2",
      placeId: "place-filter-2",
      busyness0To100: 58,
      busynessSource: "forecast",
      mfRatio: 47,
      confidence0To1: 0.68,
      sampleSize: 8,
      computedAt: new Date().toISOString(),
      lastBusynessRefresh: new Date().toISOString(),
    },
  },
  {
    id: "venue-filter-3",
    placeId: "place-filter-3",
    zoneId: "south-end",
    name: "Goldie's Patio",
    address: "303 Filter Ave",
    lat: 35.213,
    lng: -80.863,
    category: "restaurant",
    photoUrl: null,
    hidden: false,
    signal: {
      venueId: "venue-filter-3",
      placeId: "place-filter-3",
      busyness0To100: 24,
      busynessSource: "crowd",
      mfRatio: 50,
      confidence0To1: 0.6,
      sampleSize: 5,
      computedAt: new Date().toISOString(),
      lastBusynessRefresh: new Date().toISOString(),
    },
  },
];

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

async function mockVenues(page: Page) {
  await page.route("**/api/venues**", (route) => {
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
        data: { venues },
        meta,
      }),
    });
  });
}

test.describe("Home filters", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("filter chips visible on home", async ({ page }) => {
    await page.goto("/explore");

    await expect(page.getByRole("button", { name: "All" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Packed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Moderate" })).toBeVisible();
  });

  test("search filters venues", async ({ page }) => {
    await page.goto("/explore");

    const venueLinks = page.getByRole("link", { name: /^Open / });
    await expect(venueLinks).toHaveCount(venues.length);

    await page.getByRole("searchbox", { name: "Search South End venues" }).fill(venues[0].name.slice(0, 3));

    await expect(venueLinks).toHaveCount(1);
    await expect(page.getByText(venues[0].name)).toBeVisible();
    await expect(page.getByText(venues[1].name)).toHaveCount(0);
  });
});
