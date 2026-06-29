import { expect, test, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-empty-states",
};

const nullSignalVenue = {
  id: "empty-state-null-signal",
  placeId: "place-empty-state-null-signal",
  zoneId: "south-end-charlotte",
  name: "No Signal Lounge",
  address: "100 Null Signal Ave",
  lat: 35.209,
  lng: -80.861,
  category: "bar",
  photoUrl: null,
  hidden: false,
  signal: null,
};

const earlySignalVenue = {
  ...nullSignalVenue,
  id: "empty-state-early-signal",
  placeId: "place-empty-state-early-signal",
  name: "Early Reads Club",
  signal: {
    venueId: "empty-state-early-signal",
    placeId: "place-empty-state-early-signal",
    busyness0To100: null,
    busynessSource: null,
    confidence0To1: 0.2,
    computedAt: generatedAt,
    lastBusynessRefresh: null,
  },
};

async function mockVenues(page: Page, venues = [nullSignalVenue, earlySignalVenue]) {
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
          data: { venues },
          meta,
        }),
      });
    }

    if (url.pathname === `/api/venues/${nullSignalVenue.id}`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venue: nullSignalVenue },
          meta,
        }),
      });
    }

    if (url.pathname === `/api/venues/${earlySignalVenue.id}`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venue: earlySignalVenue },
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

test.describe("NV-UX-002 empty states and boundaries", () => {
  test("home shows an empty state when the venue list is empty", async ({ page }) => {
    await mockVenues(page, []);

    await page.goto("/explore");

    await expect(page.locator("h1").getByText("South End")).toBeVisible();
    await expect(page.getByText("No venues in this area yet. Check back soon.")).toBeVisible();
    await expect(page.getByRole("link", { name: "View map" })).toHaveAttribute("href", "/map");
  });

  test("home loads when all venue signals are null", async ({ page }) => {
    await mockVenues(page, [nullSignalVenue]);

    await page.goto("/explore");

    await expect(page.getByText(nullSignalVenue.name)).toBeVisible();
    await expect(page.getByText("No data")).toBeVisible();
    await expect(page.getByText("No crowd read")).toBeVisible();
    // MFRatioMiniBar returns text, not icon imagery, when signal is entirely absent.
    await expect(page.getByRole("img", { name: /male/i })).toHaveCount(0);
  });

  test("venue detail returns the custom 404 page when a venue is not cached", async ({ page }) => {
    const response = await page.goto(`/venues/${nullSignalVenue.id}`);

    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Page not found|This spot doesn't exist/i })).toBeVisible();
  });

  test("venue detail ignores client-only mocks for uncached venue ids", async ({ page }) => {
    await mockVenues(page);

    const response = await page.goto(`/venues/${earlySignalVenue.id}`);

    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Page not found|This spot doesn't exist/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /male/i })).toHaveCount(0);
  });

  test("/api/venues returns a success envelope with a venues array", async ({ request }) => {
    const response = await request.get("/api/venues");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe("success");
    expect(Array.isArray(json.data?.venues)).toBe(true);
  });
});
