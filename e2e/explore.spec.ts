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
  {
    id: "explore-null-1",
    placeId: "place-explore-null-1",
    zoneId: "south-end",
    name: "Zero Proof",
    address: "303 Explore Ave",
    lat: 35.215,
    lng: -80.864,
    category: "lounge",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "explore-null-1",
      placeId: "place-explore-null-1",
      busyness0To100: null,
      busynessSource: null,
      mfRatio: null,
      confidence0To1: 0,
      sampleSize: 0,
      computedAt: generatedAt,
      lastBusynessRefresh: null,
    },
  },
];

const trendingVenues = [
  {
    id: "trending-hot-1",
    placeId: "place-trending-hot-1",
    zoneId: "south-end",
    name: "Neon Social",
    address: "303 Trend Ave",
    lat: 35.213,
    lng: -80.862,
    category: "bar",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "trending-hot-1",
      placeId: "place-trending-hot-1",
      busyness0To100: 88,
      busynessSource: "live",
      mfRatio: null,
      confidence0To1: 0.82,
      sampleSize: 16,
      computedAt: generatedAt,
      updatedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
];

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

async function mockVenues(page: Page, venueList = venues) {
  await page.unroute("**/api/venues**").catch(() => undefined);

  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      return route.continue();
    }

    if (url.pathname === "/api/venues/trending") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venues: trendingVenues },
          meta,
        }),
      });
    }

    if (url.pathname !== "/api/venues") {
      return route.continue();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: venueList },
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
    await expect(page.getByPlaceholder("Search venues...")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Busiest first" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quietest first" })).toBeVisible();
    await expect(page.getByRole("button", { name: "A-Z" })).toBeVisible();
  });

  test("shows Trending Now above search and links to venue detail", async ({ page }) => {
    await page.goto("/explore");

    const trending = page.getByRole("region", { name: "Trending Now" });
    await expect(trending).toBeVisible();
    await expect.poll(async () => {
      const trendingBox = await trending.boundingBox();
      const searchBox = await page.locator("#venue-search").boundingBox();
      return trendingBox != null && searchBox != null && trendingBox.y < searchBox.y;
    }).toBe(true);
    await expect(trending.getByText("Neon Social")).toBeVisible();
    await expect(trending.getByText("88%")).toBeVisible();

    await trending.getByRole("link", { name: "Open Neon Social" }).click();

    await expect(page).toHaveURL(/\/venues\/trending-hot-1$/);
  });

  test("search bar filters venue list", async ({ page }) => {
    await page.goto("/explore");

    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Lowlight Lounge", exact: true })).toBeVisible();

    const searchBox = page.getByRole("searchbox", { name: "Search venues" });
    await searchBox.fill("Pulse");

    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Lowlight Lounge", exact: true })).toHaveCount(0);

    await searchBox.fill("Explore Ave");

    await expect(page.getByText("No matches for 'Explore Ave'. Try a different name.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toHaveCount(0);
  });

  test("sorts by busyness with null crowd data last", async ({ page }) => {
    await page.goto("/explore");

    const cards = page.getByRole("article");
    await expect(cards.first()).toContainText("Pulse Room");
    await expect(cards.nth(2)).toContainText("Zero Proof");

    await page.getByRole("button", { name: "Quietest first" }).click();

    await expect(cards.first()).toContainText("Lowlight Lounge");
    await expect(cards.nth(2)).toContainText("Zero Proof");

    await page.getByRole("button", { name: "A-Z" }).click();

    await expect(cards.first()).toContainText("Lowlight Lounge");
    await expect(cards.nth(1)).toContainText("Pulse Room");
  });

  test("shows honest empty venue and sparse signal states", async ({ page }) => {
    await page.goto("/explore");

    const zeroProof = page.getByRole("link", { name: "Open Zero Proof" });
    await expect(zeroProof).toContainText("No crowd data");
    await expect(zeroProof).toContainText("No vibe reads yet");
    await expect(zeroProof).not.toContainText("LIVE");
  });

  test("venue cards show category, open status, busyness, ratio, and photo fallback", async ({ page }) => {
    await page.goto("/explore");

    const pulseRoom = page.getByRole("link", { name: "Open Pulse Room", exact: true });
    await expect(pulseRoom).toContainText("Club");
    await expect(pulseRoom).toContainText("Open now");
    await expect(pulseRoom).toContainText("Packed");
    await expect(pulseRoom).toContainText("52M");
    await expect(pulseRoom).toContainText("48F");
    await expect(pulseRoom.locator("div[aria-hidden='true']").filter({ hasText: /^P$/ })).toBeVisible();
  });

  test("shows honest no venues empty state", async ({ page }) => {
    await mockVenues(page, []);
    await page.goto("/explore");

    await expect(page.getByText("No venues in this area yet. Check back soon.")).toBeVisible();
  });

  test("Packed filter shows only packed venues", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("button", { name: "Packed" }).click();

    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Lowlight Lounge", exact: true })).toHaveCount(0);
  });

  test("Dead filter shows low-busyness venues", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("button", { name: "Dead" }).click();

    await expect(page.getByRole("link", { name: "Open Lowlight Lounge", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toHaveCount(0);
  });

  test("empty filtered results can clear filters", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("button", { name: "Uptown" }).click();

    await expect(page.getByText("No spots match this filter.")).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();

    await expect(page.getByRole("link", { name: "Open Pulse Room", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Lowlight Lounge", exact: true })).toBeVisible();
  });

  test("venue card click navigates to the venue detail route", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("link", { name: "Open Pulse Room", exact: true }).click();

    await expect(page).toHaveURL(/\/venues\/explore-packed-1$/);
  });
});
