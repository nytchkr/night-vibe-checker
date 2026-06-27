import { expect, test, type Locator, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-map",
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
  zoneId = "south-end-charlotte",
}: {
  busyness: number | null;
  category: string;
  id: string;
  lat: number;
  lng: number;
  name: string;
  openNow?: boolean;
  source?: "crowd" | "forecast" | "live";
  zoneId?: "south-end-charlotte" | "dilworth-charlotte" | "south-park-charlotte";
}) {
  return {
    id,
    placeId: `place-${id}`,
    zoneId,
    name,
    address: `${busyness} Map Ave`,
    lat,
    lng,
    category,
    photoUrl: null,
    openingHours: [
      "Monday: 4:00 PM - 2:00 AM",
      "Tuesday: 4:00 PM - 2:00 AM",
      "Wednesday: 4:00 PM - 2:00 AM",
      "Thursday: 4:00 PM - 2:00 AM",
      "Friday: 4:00 PM - 2:00 AM",
      "Saturday: 4:00 PM - 2:00 AM",
      "Sunday: 4:00 PM - 12:00 AM",
    ],
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
    id: "map-packed-1",
    name: "Map Test Club",
    lat: 35.2178,
    lng: -80.8597,
    category: "night_club",
    busyness: 96,
    source: "live",
  }),
  makeVenue({
    id: "map-rooftop-1",
    name: "Map Test Rooftop",
    lat: 35.2184,
    lng: -80.8587,
    category: "rooftop",
    busyness: 88,
  }),
  makeVenue({
    id: "map-dance-1",
    name: "Map Test Dance Hall",
    lat: 35.2169,
    lng: -80.8605,
    category: "dance_club",
    busyness: 76,
  }),
  makeVenue({
    id: "map-moderate-1",
    name: "Map Test Lounge",
    lat: 35.219,
    lng: -80.857,
    category: "bar",
    busyness: 64,
  }),
  makeVenue({
    id: "map-cocktail-1",
    name: "Map Test Cocktail Bar",
    lat: 35.2161,
    lng: -80.8589,
    category: "cocktail_bar",
    busyness: 52,
  }),
  makeVenue({
    id: "map-quiet-1",
    name: "Map Test Speakeasy",
    lat: 35.2195,
    lng: -80.861,
    category: "speakeasy",
    busyness: 22,
    openNow: false,
  }),
  makeVenue({
    id: "map-dilworth-1",
    name: "Dilworth Test Bar",
    lat: 35.204,
    lng: -80.844,
    category: "bar",
    busyness: 44,
    zoneId: "dilworth-charlotte",
  }),
  makeVenue({
    id: "map-southpark-1",
    name: "South Park Test Lounge",
    lat: 35.1524,
    lng: -80.8462,
    category: "lounge",
    busyness: null,
    zoneId: "south-park-charlotte",
  }),
];

const topFiveVenueNames = venues.slice(0, 5).map((venue) => venue.name);

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function mockVenues(page: Page, delayMs = 0) {
  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET" || url.pathname !== "/api/venues") {
      return route.continue();
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-container", { timeout: 25000 });
  const sheet = page.locator('section[aria-label="South End venues"]');
  await sheet.waitFor({ state: "attached", timeout: 20000 });
  return sheet;
}

async function selectZone(page: Page, zoneName: "All" | "South End" | "Dilworth" | "South Park") {
  const zoneFilters = page.getByRole("group", { name: "Map zone filter" });
  await expect(zoneFilters).toBeVisible({ timeout: 10000 });
  await zoneFilters.getByRole("button", { name: zoneName }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
}

async function visibleSheetHeight(page: Page, sheet: Locator) {
  const sheetBox = await sheet.boundingBox();
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(mapBox).not.toBeNull();

  return Math.round(Math.min(sheetBox!.height, mapBox!.y + mapBox!.height - sheetBox!.y));
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

async function expectTopFiveVenues(sheet: Locator) {
  for (const name of topFiveVenueNames) {
    await expect(sheet.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  }
}

async function selectedPinCount(page: Page) {
  return page.locator(".venue-cluster-pin-selected").count();
}

test.describe("Map tab", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("/map page loads", async ({ page, request }) => {
    const response = await request.get("/map");
    expect(response.status()).toBe(200);

    await page.unroute("**/api/venues**");
    await mockVenues(page, 2000);

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading map...")).toBeVisible({ timeout: 10000 });
    // VenueMap is dynamically imported (SSR=false) — Leaflet takes time to hydrate in headless
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();
    // Legend pill visible (premium redesign replaced "N spots" counter with legend)
    await expect(page.getByText(/Packed|Moderate|Quiet/i).first()).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole("group", { name: "Map busyness filter" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Map zone filter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter venues" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Recenter to South End" })).toBeVisible();
  });

  test("Report Vibe FAB is visible on /map", async ({ page }) => {
    await page.goto("/map");
    // FAB is inside dynamic VenueMap — wait for Leaflet before checking FAB
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    await expect(page.getByRole("link", { name: /Report vibe/i })).toBeVisible({ timeout: 10000 });
  });

  test("redesigned bottom sheet lists venue previews", async ({ page }) => {
    const sheet = await openMap(page);
    await expect(sheet.getByRole("button", { name: /Expand South End venue list/ })).toBeVisible();

    const packedVenue = sheet.getByRole("button", { name: /Map Test Club/ });
    await expect(packedVenue).toBeVisible();
    await expect(packedVenue).toContainText("night_club");
    await expect(packedVenue).toContainText("Packed");
  });

  test("category pills filter the visible venue list", async ({ page }) => {
    const sheet = await openMap(page);
    await selectZone(page, "South End");

    const categoryFilters = page.getByRole("group", { name: "Map category filter" });
    await expect(categoryFilters).toBeVisible();

    for (const label of ["All", "Bars", "Clubs", "Restaurants", "Lounges"]) {
      await expect(categoryFilters.getByRole("button", { name: label })).toBeVisible();
    }

    await categoryFilters.getByRole("button", { name: "Clubs" }).click();
    await dragSheet(page, sheet, -230);

    await expect(sheet.getByRole("button", { name: /Map Test Club/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Map Test Dance Hall/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Map Test Cocktail Bar/ })).toHaveCount(0);
  });

  test("nearby venues collapse into a purple cluster when zoomed out", async ({ page }) => {
    await openMap(page);
    await selectZone(page, "South End");

    await expect(page.locator(".venue-cluster-pin")).toHaveCount(6, { timeout: 10000 });

    const cluster = page.locator(".venue-cluster-icon").first();
    const zoomOut = page.locator(".leaflet-control-zoom-out");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await zoomOut.click();
      await page.waitForTimeout(500);
      if (await cluster.isVisible()) {
        break;
      }
    }

    await expect(cluster).toBeVisible({ timeout: 10000 });
    await expect(cluster).toContainText("6");
    await expect(cluster).toHaveCSS("background-color", "rgb(139, 108, 255)");
    await expect(cluster).toHaveCSS("color", "rgb(255, 255, 255)");

    await cluster.click();
    await expect(page.locator(".venue-cluster-pin")).toHaveCount(6, { timeout: 10000 });
  });

  test("only live source pins render the pulse ring class", async ({ page }) => {
    await openMap(page);
    await selectZone(page, "South End");

    await expect(page.locator(".venue-cluster-pin")).toHaveCount(6, { timeout: 10000 });
    await expect(page.locator(".venue-pin-live-dot")).toHaveCount(1);
  });

  test("zone toggle filters South End, Dilworth, and South Park venues with busyness-colored pins", async ({ page }) => {
    const sheet = await openMap(page);

    await selectZone(page, "South End");
    await expect(page.locator(".venue-cluster-pin")).toHaveCount(6, { timeout: 10000 });
    const southEndColors = await page.locator(".venue-cluster-pin > span").evaluateAll((pins) =>
      pins.map((pin) => getComputedStyle(pin).backgroundColor),
    );
    expect(southEndColors).toContain("rgb(0, 245, 212)");
    expect(southEndColors).toContain("rgb(255, 209, 102)");
    expect(southEndColors).toContain("rgb(240, 86, 140)");

    await selectZone(page, "Dilworth");
    await dragSheet(page, sheet, -230);
    await expect(sheet.getByRole("button", { name: /Dilworth Test Bar/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Map Test Club/ })).toHaveCount(0);

    await selectZone(page, "South Park");
    await expect(sheet.getByRole("button", { name: /South Park Test Lounge/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Dilworth Test Bar/ })).toHaveCount(0);
    await expect(page.locator(".venue-cluster-pin")).toHaveCount(1, { timeout: 10000 });
    const southParkColors = await page.locator(".venue-cluster-pin > span").evaluateAll((pins) =>
      pins.map((pin) => getComputedStyle(pin).backgroundColor),
    );
    expect(southParkColors).toContain("rgb(102, 102, 102)");

    await selectZone(page, "All");
    await expect(sheet.getByRole("button", { name: /Map Test Club/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /South Park Test Lounge/ })).toBeVisible();
  });

  test("city selector shows coming-soon neighborhoods without switching away from launch city", async ({ page }) => {
    const sheet = await openMap(page);
    await selectZone(page, "South End");

    await page.getByRole("button", { name: "Choose neighborhood, currently South End" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose map city" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole("button", { name: /NoDa/ })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: /Uptown/ })).toBeDisabled();
    await dialog.getByRole("button", { name: /South End/ }).click();

    await expect(sheet).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("nightvibe:selected-city"))).toBe("south-end-clt");
    await expect.poll(() => page.locator(".venue-cluster-pin").count()).toBe(6);
  });

  test("zip recenter control validates launch-area zip codes", async ({ page }) => {
    await openMap(page);

    const zipInput = page.getByLabel("Search by zip");
    await expect(zipInput).toBeVisible();

    await zipInput.fill("99999");
    await page.getByRole("button", { name: "Search zip" }).click();
    await expect(page.getByText("Not live in your area yet")).toBeVisible();

    await zipInput.fill("28203");
    await zipInput.press("Enter");
    await expect(page.getByText("Not live in your area yet")).toHaveCount(0);
  });

  test("FAB links to /vibe-check", async ({ page }) => {
    await page.goto("/map");
    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    const fab = page.getByRole("link", { name: /Report vibe/i });
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

  test("/ renders the default map tab", async ({ page }) => {
    await page.goto("/");

    await page.waitForSelector(".leaflet-container", { timeout: 25000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Map" })).toBeVisible();
  });
});

test.describe("Map bottom sheet", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("shows collapsed bottom sheet by default", async ({ page }) => {
    const sheet = await openMap(page);

    await expect(sheet.getByRole("button", { name: /Expand South End venue list/ })).toBeVisible();
    await expect
      .poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 })
      .toBeGreaterThanOrEqual(108);
    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeLessThanOrEqual(124);
  });

  test("can be dragged to mid position", async ({ page }) => {
    const sheet = await openMap(page);

    await dragSheet(page, sheet, -230);

    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeGreaterThan(240);
    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeLessThan(340);
    await expectTopFiveVenues(sheet);
  });

  test("can be dragged to expanded position", async ({ page }) => {
    const sheet = await openMap(page);

    await dragSheet(page, sheet, -520);

    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeGreaterThan(560);
    await expect(sheet.getByRole("button", { name: /Map Test Speakeasy/ })).toBeVisible();
  });

  test("tapping a venue in mid sheet selects it on the map", async ({ page }) => {
    const sheet = await openMap(page);
    await selectZone(page, "South End");

    await dragSheet(page, sheet, -230);
    const venue = sheet.getByRole("button", { name: /Map Test Rooftop/ });
    await venue.click();

    await expect(venue).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => selectedPinCount(page), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  });

  test("sheet snaps to mid when map pin is tapped", async ({ page }) => {
    const sheet = await openMap(page);
    await selectZone(page, "South End");

    await page.getByRole("button", { name: "Open Map Test Club details" }).click();

    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeGreaterThan(240);
    await expect.poll(() => visibleSheetHeight(page, sheet), { timeout: 10000 }).toBeLessThan(340);
    await expect.poll(() => selectedPinCount(page), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
    await expect(sheet.getByRole("button", { name: /Map Test Club/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("pin taps meet mobile target size and detail sheet shows real hours status", async ({ page }) => {
    await openMap(page);
    await selectZone(page, "South End");
    await expect(page.locator(".venue-cluster-pin")).toHaveCount(6, { timeout: 10000 });

    const pin = page.getByRole("button", { name: "Open Map Test Speakeasy details" });
    await expect(pin).toBeVisible({ timeout: 10000 });
    const pinBox = await pin.boundingBox();
    expect(pinBox).not.toBeNull();
    expect(pinBox!.width).toBeGreaterThanOrEqual(44);
    expect(pinBox!.height).toBeGreaterThanOrEqual(44);

    await pin.click();

    const detailSheet = page.getByRole("dialog", { name: "Map Test Speakeasy details" });
    await expect(detailSheet).toBeVisible();
    await expect(detailSheet.getByText("Closed now")).toBeVisible();
    await expect(detailSheet.getByText(/PM/)).toBeVisible();
    await expect(detailSheet.getByRole("link", { name: "View Venue" }).first()).toBeVisible();
  });
});
