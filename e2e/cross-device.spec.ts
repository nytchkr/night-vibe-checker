import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-cross-device",
};

type TestVenue = {
  id: string;
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  photoUrl?: string | null;
  photoUrls?: string[];
  openNow?: boolean | null;
  hidden?: boolean;
  rating?: number | null;
  googleRating?: number | null;
  totalRatings?: number | null;
  priceLevel?: number | null;
  signal?: {
    venueId: string;
    placeId: string;
    busyness0To100: number | null;
    busynessSource: "live" | "forecast" | "crowd" | null;
    mfRatio: number | null;
    confidence0To1: number;
    sampleSize: number;
    computedAt: string;
    lastBusynessRefresh: string | null;
  } | null;
};

const fallbackVenues: TestVenue[] = [
  {
    id: "cross-device-pulse",
    placeId: "place-cross-device-pulse",
    zoneId: "south-end-charlotte",
    name: "Cross Device Pulse",
    address: "101 Device Ave",
    lat: 35.2178,
    lng: -80.8597,
    category: "night_club",
    photoUrl: null,
    openNow: true,
    hidden: false,
    rating: 4.6,
    totalRatings: 320,
    priceLevel: 2,
    signal: {
      venueId: "cross-device-pulse",
      placeId: "place-cross-device-pulse",
      busyness0To100: 91,
      busynessSource: "live",
      mfRatio: 52,
      confidence0To1: 0.86,
      sampleSize: 19,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
  {
    id: "cross-device-lounge",
    placeId: "place-cross-device-lounge",
    zoneId: "south-end-charlotte",
    name: "Cross Device Lounge",
    address: "202 Device Ave",
    lat: 35.2185,
    lng: -80.8588,
    category: "bar",
    photoUrl: null,
    openNow: true,
    hidden: false,
    rating: 4.4,
    totalRatings: 210,
    priceLevel: 2,
    signal: {
      venueId: "cross-device-lounge",
      placeId: "place-cross-device-lounge",
      busyness0To100: 63,
      busynessSource: "forecast",
      mfRatio: 48,
      confidence0To1: 0.72,
      sampleSize: 11,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
];

test.use({ serviceWorkers: "block" });

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nightvibe.onboarded", "1");
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function getRealVenue(request: APIRequestContext): Promise<TestVenue | null> {
  const response = await request.get("/api/venues");
  if (!response.ok()) return null;

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as TestVenue[];
  return venues.find((venue) => venue.id && venue.name) ?? null;
}

async function getNoPhotoVenue(request: APIRequestContext): Promise<TestVenue | null> {
  const response = await request.get("/api/venues");
  if (!response.ok()) return null;

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as TestVenue[];
  return venues.find((venue) => {
    const photoUrls = Array.isArray(venue.photoUrls) ? venue.photoUrls.filter(Boolean) : [];
    return venue.id && venue.name && !venue.photoUrl && photoUrls.length === 0;
  }) ?? null;
}

async function mockVenueApis(page: Page, venues: TestVenue[]) {
  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      return route.continue();
    }

    if (url.pathname === "/api/venues" || url.pathname === "/api/venues/trending") {
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

    return route.continue();
  });

  await page.route("**/api/activity/feed**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { items: [] },
        meta,
      }),
    });
  });
}

async function preventFetchedVenuePhotos(page: Page) {
  await page.route("**/api/venues/*/photos", async (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ photos: [] }),
    });
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  }).toBe(true);
}

function bottomNav(page: Page) {
  return page.locator("nav.app-bottom-nav");
}

function sidebarNav(page: Page) {
  return page.locator("nav.app-sidebar");
}

function isDesktop(projectName: string) {
  return projectName.includes("desktop");
}

async function expectVenueCardVisible(page: Page, venueName: string) {
  await expect(page.getByRole("link", { name: `Open ${venueName}`, exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

async function expectMapReady(page: Page) {
  await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".venue-cluster-pin, .leaflet-marker-icon").first()).toBeVisible({ timeout: 25_000 });
}

async function expectTappableNav(page: Page, projectName: string) {
  if (isDesktop(projectName)) {
    await expect(bottomNav(page)).not.toBeVisible();
    await expect(sidebarNav(page)).toBeVisible();
    expect(await page.getByText("nytchkr is optimized for mobile.").count()).toBe(0);
    return;
  }

  const nav = bottomNav(page);
  await expect(nav).toBeVisible();

  for (const label of ["Map", "Explore", "You"]) {
    const tab = nav.getByRole("link", { name: label });
    await expect(tab).toBeVisible();
    await expect(tab).toBeEnabled();
  }
}

test.describe("@device cross-device browser coverage", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
  });

  test("@device home map loads with venue cards and pins", async ({ page }, testInfo) => {
    await mockVenueApis(page, fallbackVenues);

    await page.goto("/");
    await expect(page.getByRole("region", { name: "Venue map" })).toBeVisible({ timeout: 15_000 });
    await expectMapReady(page);
    await expect(page.getByRole("region", { name: "South End venues" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Cross Device Pulse/ })).toBeVisible();
    await expectTappableNav(page, testInfo.project.name);
    await assertNoHorizontalOverflow(page);
  });

  test("@device explore page shows list, AI suggest, sort and filters", async ({ page }) => {
    await mockVenueApis(page, fallbackVenues);

    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "South End" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("searchbox", { name: "Search venues" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Explore sort and filters" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hottest" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Now" })).toBeVisible();
    await expect(page.getByRole("region", { name: "AI venue suggestions" })).toBeVisible();
    await expect(page.getByText("Let AI choose").first()).toBeVisible();
    await expectVenueCardVisible(page, "Cross Device Pulse");
    await assertNoHorizontalOverflow(page);
  });

  test("@device map page renders map container and venue pins", async ({ page }) => {
    await mockVenueApis(page, fallbackVenues);

    await page.goto("/map");
    await expectMapReady(page);
    await expect(page.getByRole("region", { name: "South End venues" })).toBeVisible({ timeout: 15_000 });
    await assertNoHorizontalOverflow(page);
  });

  test("@device venue card opens detail with visible hero art", async ({ page, request }) => {
    await preventFetchedVenuePhotos(page);

    const realVenue = await getNoPhotoVenue(request);
    test.skip(!realVenue, "No cached launch-zone venue without photo_url/photoUrls was available from /api/venues");

    await mockVenueApis(page, [realVenue!]);
    await page.goto("/explore");
    await expectVenueCardVisible(page, realVenue!.name);

    await page.locator(`a[href="/venues/${realVenue!.id}"]`).last().evaluate((element) => {
      (element as HTMLAnchorElement).click();
    });

    await expect(page).toHaveURL(new RegExp(`/venues/${realVenue!.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: realVenue!.name })).toBeVisible({ timeout: 15_000 });

    const hero = page.getByRole("region", { name: "Venue hero" });
    await expect(hero).toBeVisible();
    await expect(hero.locator("img, div").first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("@device login page renders accessible email form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /nytchkr/i })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
