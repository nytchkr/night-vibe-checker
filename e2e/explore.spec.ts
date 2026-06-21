import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-explore",
};

const venues = [
  {
    id: "explore-packed-1",
    placeId: "place-explore-packed-1",
    zoneId: "south-end",
    name: "Pulse Room",
    address: "101 Explore Ave",
    lat: 35.212,
    lng: -80.861,
    category: "night_club",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "explore-packed-1",
      placeId: "place-explore-packed-1",
      busyness0To100: 91,
      busynessSource: "live",
      mfRatio: 52,
      confidence0To1: 0.88,
      sampleSize: 18,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
  {
    id: "explore-quiet-1",
    placeId: "place-explore-quiet-1",
    zoneId: "south-end",
    name: "Lowlight Lounge",
    address: "202 Explore Ave",
    lat: 35.214,
    lng: -80.863,
    category: "bar",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "explore-quiet-1",
      placeId: "place-explore-quiet-1",
      busyness0To100: 21,
      busynessSource: "forecast",
      mfRatio: 47,
      confidence0To1: 0.64,
      sampleSize: 7,
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

test.describe("Explore tab", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("GET /explore returns 200", async ({ request }) => {
    const response = await request.get("/explore");
    expect(response.status()).toBe(200);
  });

  test("/explore page loads with search bar visible", async ({ page }) => {
    await page.goto("/explore");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "South End" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/Search South End/)).toBeVisible({ timeout: 10000 });
  });

  test("search bar filters venue list", async ({ page }) => {
    await page.goto("/explore");

    await expect(page.getByText("Pulse Room")).toBeVisible();
    await expect(page.getByText("Lowlight Lounge")).toBeVisible();

    const searchBox = page.getByRole("searchbox", { name: "Search venues" });
    await searchBox.fill("Pulse");

    await expect(page.getByText("Pulse Room")).toBeVisible();
    await expect(page.getByText("Lowlight Lounge")).toHaveCount(0);

    await searchBox.fill("Explore Ave");

    await expect(page.getByText('No venues match "Explore Ave"')).toBeVisible();
    await expect(page.getByText("Pulse Room")).toHaveCount(0);
  });

  test("Packed filter shows only packed venues", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("button", { name: "Packed" }).click();

    await expect(page.getByText("Pulse Room")).toBeVisible();
    await expect(page.getByText("Lowlight Lounge")).toHaveCount(0);
  });

  test("empty filtered results can clear filters", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("button", { name: /Restaurant/ }).click();

    await expect(page.getByText("No venues match your filters")).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();

    await expect(page.getByText("Pulse Room")).toBeVisible();
    await expect(page.getByText("Lowlight Lounge")).toBeVisible();
  });

  test("venue card click navigates to the venue detail route", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("link", { name: "Open Pulse Room" }).click();

    await expect(page).toHaveURL(/\/venues\/explore-packed-1$/);
  });
});
