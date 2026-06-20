import { expect, test, type Page } from "@playwright/test";

const meta = {
  cached: false,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-redesign-journey",
};

const journeyVenue = {
  id: "venue-journey-1",
  name: "Journey Test Club",
  address: "456 Journey St",
  category: "bar",
  photoUrl: null,
  signal: {
    venueId: "venue-journey-1",
    busyness0To100: 72,
    busynessSource: "live",
    mfRatio: 48,
    confidence0To1: 0.76,
    sampleSize: 4,
    computedAt: new Date().toISOString(),
    lastBusynessRefresh: new Date().toISOString(),
  },
};

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
        data: { venues: [journeyVenue] },
        meta,
      }),
    });
  });
}

test.describe("NV-067 full VibeCheck consumer journey", () => {
  test("opens feed and routes cold guest report intent through the auth gate", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await mockVenues(page);

    await test.step("1. Open the local feed and see at least one venue card", async () => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "How's South End tonight?" })).toBeVisible();
      await expect(page.getByText("Could not load venues.")).toHaveCount(0);

      const firstCard = page.locator("main li").first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.getByText("Journey Test Club")).toBeVisible();
      await expect(firstCard.getByRole("link", { name: "Sign in to report" })).toBeVisible();
    });

    const firstCard = page.locator("main li").first();

    await test.step("2. Click report from a feed card and land on login with return path", async () => {
      await firstCard.getByRole("link", { name: "Sign in to report" }).click();
      await expect(page).toHaveURL(/\/login\?return=/);
      const decoded = decodeURIComponent(page.url());
      expect(decoded).toContain("/vibe-check?venueId=venue-journey-1");
      expect(decoded).toContain("venueName=Journey+Test+Club");
      await expect(page.getByRole("heading", { name: "Sign in to report" })).toBeVisible();
    });

    await test.step("3. Direct cold guest /vibe-check access redirects before form interaction", async () => {
      await page.goto("/vibe-check?venueId=venue-journey-1&venueName=Journey%20Test%20Club");
      await expect(page).toHaveURL(/\/login\?return=/);
      expect(decodeURIComponent(page.url())).toContain("/vibe-check?venueId=venue-journey-1");
      await expect(page.getByRole("button", { name: "Report Vibe" })).toHaveCount(0);
    });
  });
});
