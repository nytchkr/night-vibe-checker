import { expect, test, type Locator, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-map-pin-sync",
};

function makeVenue({
  busyness,
  category,
  id,
  lat,
  lng,
  name,
  openNow = true,
  source = "forecast",
}: {
  busyness: number;
  category: string;
  id: string;
  lat: number;
  lng: number;
  name: string;
  openNow?: boolean;
  source?: "crowd" | "forecast" | "live";
}) {
  return {
    id,
    placeId: `place-${id}`,
    zoneId: "south-end-charlotte",
    name,
    address: `${busyness} Sync Ave`,
    lat,
    lng,
    category,
    photoUrl: null,
    openNow,
    hidden: false,
    signal: {
      venueId: id,
      placeId: `place-${id}`,
      busyness0To100: busyness,
      busynessSource: source,
      mfRatio: 51,
      confidence0To1: 0.8,
      sampleSize: 14,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  };
}

const venues = [
  makeVenue({
    id: "pin-sync-club",
    name: "Pin Sync Club",
    lat: 35.2178,
    lng: -80.8597,
    category: "night_club",
    busyness: 96,
    source: "live",
  }),
  makeVenue({
    id: "pin-sync-rooftop",
    name: "Pin Sync Rooftop",
    lat: 35.2184,
    lng: -80.8587,
    category: "rooftop",
    busyness: 88,
  }),
  makeVenue({
    id: "pin-sync-dance",
    name: "Pin Sync Dance Hall",
    lat: 35.2169,
    lng: -80.8605,
    category: "dance_club",
    busyness: 76,
  }),
  makeVenue({
    id: "pin-sync-lounge",
    name: "Pin Sync Lounge",
    lat: 35.219,
    lng: -80.857,
    category: "bar",
    busyness: 64,
  }),
  makeVenue({
    id: "pin-sync-cocktail",
    name: "Pin Sync Cocktail Bar",
    lat: 35.2161,
    lng: -80.8589,
    category: "cocktail_bar",
    busyness: 52,
  }),
  makeVenue({
    id: "pin-sync-speakeasy",
    name: "Pin Sync Speakeasy",
    lat: 35.2195,
    lng: -80.861,
    category: "speakeasy",
    busyness: 22,
    openNow: false,
  }),
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

async function openMap(page: Page) {
  await page.goto("/map");
  await page.waitForSelector(".leaflet-container", { timeout: 25000 });

  const sheet = page.getByRole("region", { name: "South End venues" });
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Loading spots...")).toHaveCount(0, { timeout: 10000 });

  return sheet;
}

async function dragSheet(page: Page, sheet: Locator, deltaY: number) {
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();

  const x = box!.x + box!.width / 2;
  const y = box!.y + 14;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 12 });
  await page.mouse.up();
}

function venueRow(sheet: Locator, name: string) {
  return sheet.getByRole("button", { name: new RegExp(name) });
}

async function visiblePinCount(page: Page) {
  return page.locator("path.leaflet-interactive").count();
}

async function selectedPinCount(page: Page) {
  return page.locator('path.leaflet-interactive[stroke="#00F5D4"]').count();
}

test.describe("Map pin/list sync", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("clicking a map pin scrolls the venue list to show that venue", async ({ page }) => {
    const sheet = await openMap(page);

    await expect(venueRow(sheet, "Pin Sync Speakeasy")).toHaveCount(0);
    await page.locator('path.leaflet-interactive[fill="#4ADE80"]').dispatchEvent("click");

    const selectedVenue = venueRow(sheet, "Pin Sync Speakeasy");
    await expect(selectedVenue).toBeVisible({ timeout: 10000 });
    await expect(selectedVenue).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking a venue in the list selects and highlights the corresponding pin", async ({ page }) => {
    const sheet = await openMap(page);

    await dragSheet(page, sheet, -230);
    await expect.poll(() => selectedPinCount(page), { timeout: 10000 }).toBe(0);

    const selectedVenue = venueRow(sheet, "Pin Sync Rooftop");
    await selectedVenue.click();

    await expect(selectedVenue).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => selectedPinCount(page), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  });

  test("the selected venue name appears visually highlighted in the list", async ({ page }) => {
    const sheet = await openMap(page);

    await dragSheet(page, sheet, -230);
    const selectedVenue = venueRow(sheet, "Pin Sync Dance Hall");
    await selectedVenue.click();

    await expect(selectedVenue).toHaveAttribute("aria-pressed", "true");
    await expect(selectedVenue).toHaveClass(/ring-\[#00F5D4\]\/60/);
    await expect(selectedVenue).toHaveClass(/bg-white\/\[0\.1\]/);
  });

  test("search filter reduces pins and list items simultaneously", async ({ page }) => {
    const sheet = await openMap(page);

    await expect.poll(() => visiblePinCount(page), { timeout: 10000 }).toBe(venues.length);
    await expect(sheet.getByRole("button", { name: /^Pin Sync / })).toHaveCount(5);

    await page.getByRole("searchbox", { name: "Search venues" }).fill("Rooftop");

    await expect.poll(() => visiblePinCount(page), { timeout: 10000 }).toBe(1);
    await expect(sheet.getByRole("button", { name: /^Pin Sync / })).toHaveCount(1);
    await expect(venueRow(sheet, "Pin Sync Rooftop")).toBeVisible();
    await expect(venueRow(sheet, "Pin Sync Club")).toHaveCount(0);
    await expect(page.getByText("Showing 1 of 6")).toBeVisible();
  });
});
