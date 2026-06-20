import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-map",
};

const venues = [
  {
    id: "map-packed-1",
    placeId: "place-map-packed-1",
    zoneId: "south-end",
    name: "Map Test Club",
    address: "303 Map Ave",
    lat: 35.2178,
    lng: -80.8597,
    category: "night_club",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "map-packed-1",
      placeId: "place-map-packed-1",
      busyness0To100: 86,
      busynessSource: "live",
      mfRatio: 51,
      confidence0To1: 0.8,
      sampleSize: 14,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
  {
    id: "map-moderate-1",
    placeId: "place-map-moderate-1",
    zoneId: "south-end",
    name: "Map Test Lounge",
    address: "404 Map Ave",
    lat: 35.219,
    lng: -80.857,
    category: "bar",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "map-moderate-1",
      placeId: "place-map-moderate-1",
      busyness0To100: 48,
      busynessSource: "forecast",
      mfRatio: 49,
      confidence0To1: 0.7,
      sampleSize: 9,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
];

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
        data: { venues },
        meta,
      }),
    });
  });
}

test.describe("Map tab", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("/map page loads", async ({ page, request }) => {
    const response = await request.get("/map");
    expect(response.status()).toBe(200);

    await page.goto("/map");
    // VenueMap is dynamically imported (SSR=false) — Leaflet takes time to hydrate in headless
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByText(/spots/)).toBeVisible({ timeout: 25000 });
  });

  test("Report Vibe FAB is visible on /map", async ({ page }) => {
    await page.goto("/map");
    // FAB is inside dynamic VenueMap — wait for Leaflet before checking FAB
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    await expect(page.getByRole("link", { name: /Report Vibe/ })).toBeVisible({ timeout: 10000 });
  });

  test("FAB links to /vibe-check", async ({ page }) => {
    await page.goto("/map");
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    const fab = page.getByRole("link", { name: /Report Vibe/ });
    await expect(fab).toBeVisible({ timeout: 10000 });
    // /vibe-check requires auth — guests land on /login. Verify link href, not navigation.
    const href = await fab.getAttribute("href");
    expect(href).toMatch(/\/vibe-check/);
  });

  test("bottom nav shows Map, Explore, and You tabs", async ({ page }) => {
    await page.goto("/map");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Map" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Explore" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "You" })).toBeVisible();
  });

  test("clicking Explore tab navigates to /explore", async ({ page }) => {
    await page.goto("/map");
    await page.waitForLoadState("networkidle");

    const exploreTab = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Explore" });
    await expect(exploreTab).toBeVisible();
    await exploreTab.click({ force: true });

    await expect(page).toHaveURL(/\/explore$/, { timeout: 10000 });
  });

  test("clicking You tab navigates to /profile", async ({ page }) => {
    await page.goto("/map");
    await page.waitForLoadState("networkidle");

    const youTab = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "You" });
    await expect(youTab).toBeVisible();
    await youTab.click({ force: true });

    await expect(page).toHaveURL(/\/profile$/, { timeout: 10000 });
  });

  test("/ redirects to /map", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/map$/);
  });
});
