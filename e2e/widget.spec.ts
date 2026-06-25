import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const widgetVenue = {
  id: "widget-venue-1",
  placeId: "place-widget-venue-1",
  zoneId: "south-end",
  name: "Widget Test Club",
  address: "121 Widget Way",
  lat: 35.2123,
  lng: -80.859,
  category: "night_club",
  photoUrl: null,
  hidden: false,
  signal: {
    venueId: "widget-venue-1",
    placeId: "place-widget-venue-1",
    busyness0To100: 73,
    busynessSource: "live",
    mfRatio: 52,
    confidence0To1: 0.86,
    sampleSize: 19,
    computedAt: generatedAt,
    lastBusynessRefresh: generatedAt,
  },
};

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-widget",
};

function isProductionBaseUrl() {
  return (process.env.BASE_URL ?? "").includes("nytchkr.com");
}

async function mockVenues(page: Page, venues = [widgetVenue]) {
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

test.describe("NV-TEST-021 embeddable busyness widget", () => {
  test("renders a mocked venue", async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses mocked /api/venues data and is only valid against a local app server");
    await mockVenues(page);

    await page.goto(`/widget/${widgetVenue.id}`);

    const widget = page.getByRole("region", { name: "NightVibe busyness widget" });
    await expect(widget).toBeVisible();
    await expect(widget.getByRole("heading", { name: widgetVenue.name })).toBeVisible();
    await expect(widget.getByText(widgetVenue.address)).toBeVisible();
    await expect(widget.getByText("73%")).toBeVisible();
  });

  test("busyness bar width reflects the venue percentage", async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses mocked /api/venues data and is only valid against a local app server");
    await mockVenues(page);

    await page.goto(`/widget/${widgetVenue.id}`);

    await expect(page.getByTestId("busyness-bar-fill")).toHaveAttribute("style", /width:\s*73%;/);
  });

  test("?embed=1 does not show the NightVibe navbar", async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses mocked /api/venues data and is only valid against a local app server");
    await mockVenues(page);

    await page.goto(`/widget/${widgetVenue.id}?embed=1`);

    await expect(page.getByRole("heading", { name: widgetVenue.name })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  });

  test("shows a 404 state when the venue id does not match any venue", async ({ page }) => {
    await mockVenues(page, []);

    await page.goto("/widget/not-a-cached-venue");

    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Page not found|Venue not found/i })).toBeVisible();
  });
});
