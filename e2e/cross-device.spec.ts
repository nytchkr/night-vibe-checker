import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const generatedAt = new Date().toISOString();

type TestVenue = {
  id: string;
  slug?: string;
  placeId: string;
  zoneId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  neighborhood?: string;
  photoUrl?: string | null;
  photoUrls?: string[];
  openNow?: boolean | null;
  hidden?: boolean;
  rating?: number | null;
  googleRating?: number | null;
  totalRatings?: number | null;
  userRatingCount?: number | null;
  priceLevel?: number | null;
  openingHours?: string[];
  signal?: {
    venueId: string;
    placeId: string;
    busyness0To100: number | null;
    busynessSource: "live" | "forecast" | "crowd" | null;
    confidence0To1: number;
    computedAt: string;
    lastBusynessRefresh: string | null;
  } | null;
};

const venues: TestVenue[] = [
  {
    id: "cross-device-pulse",
    slug: "cross-device-pulse",
    placeId: "place-cross-device-pulse",
    zoneId: "south-end-charlotte",
    name: "Cross Device Pulse",
    address: "101 Device Ave",
    lat: 35.2178,
    lng: -80.8597,
    neighborhood: "South End",
    category: "night_club",
    photoUrl: null,
    photoUrls: [],
    openNow: true,
    hidden: false,
    rating: 4.6,
    googleRating: 4.6,
    totalRatings: 320,
    userRatingCount: 320,
    priceLevel: 2,
    openingHours: ["Friday: 5:00 PM - 2:00 AM"],
    signal: {
      venueId: "cross-device-pulse",
      placeId: "place-cross-device-pulse",
      busyness0To100: 91,
      busynessSource: "live",
      confidence0To1: 0.86,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
  {
    id: "cross-device-lounge",
    slug: "cross-device-lounge",
    placeId: "place-cross-device-lounge",
    zoneId: "south-end-charlotte",
    name: "Cross Device Lounge",
    address: "202 Device Ave",
    lat: 35.2185,
    lng: -80.8588,
    neighborhood: "South End",
    category: "bar",
    photoUrl: null,
    photoUrls: [],
    openNow: true,
    hidden: false,
    rating: 4.4,
    googleRating: 4.4,
    totalRatings: 210,
    userRatingCount: 210,
    priceLevel: 2,
    openingHours: ["Friday: 4:00 PM - 2:00 AM"],
    signal: {
      venueId: "cross-device-lounge",
      placeId: "place-cross-device-lounge",
      busyness0To100: 63,
      busynessSource: "forecast",
      confidence0To1: 0.72,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
];

const meta = {
  cached: true,
  generatedAt,
  requestId: "e2e-cross-device",
};

test.use({ serviceWorkers: "block" });

function isDesktop(testInfo: TestInfo) {
  return testInfo.project.name.includes("desktop");
}

async function clearClientState(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nightvibe.onboarded", "true");
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function mockVenueApis(page: Page, options: { holdFirstVenueRequest?: boolean } = {}) {
  let venueListRequests = 0;
  let shouldReleaseFirstVenueResponse = false;
  let pendingFirstVenueRelease: (() => void) | null = null;

  const releaseFirstVenueResponse = () => {
    shouldReleaseFirstVenueResponse = true;
    pendingFirstVenueRelease?.();
    pendingFirstVenueRelease = null;
  };

  await page.route("**/api/activity/feed**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") return route.continue();

    if (url.pathname === "/api/venues/trending") {
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

    if (url.pathname === "/api/venues") {
      venueListRequests += 1;
      if (venueListRequests === 1 && options.holdFirstVenueRequest && !shouldReleaseFirstVenueResponse) {
        await new Promise<void>((resolve) => {
          pendingFirstVenueRelease = resolve;
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venues },
          meta: { ...meta, requestNumber: venueListRequests },
        }),
      });
    }

    const [, apiSegment, venuesSegment, venueId, childRoute] = url.pathname.split("/");
    if (apiSegment !== "api" || venuesSegment !== "venues" || !venueId) return route.continue();

    const venue = venues.find((item) => item.id === venueId || item.slug === venueId);

    if (childRoute === "photos") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ photos: [] }),
      });
    }

    if (childRoute === "besttime-forecast") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data: { forecast: [] } }),
      });
    }

    if (venue) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { venue },
          meta,
        }),
      });
    }

    return route.continue();
  });

  return {
    getVenueRequestCount: () => venueListRequests,
    releaseFirstVenueResponse,
  };
}

async function getLaunchVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const launchVenue = (body?.data?.venues ?? []).find((venue: TestVenue) => venue.id && venue.name);
  expect(launchVenue, "Expected at least one cached launch-zone venue from /api/venues").toBeTruthy();
  return launchVenue;
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => {
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  }).toBe(true);
}

async function assertShellNavigation(page: Page, testInfo: TestInfo) {
  if (isDesktop(testInfo)) {
    await expect(page.locator("nav.app-bottom-nav")).not.toBeVisible();
    await expect(page.locator("nav.app-sidebar")).toBeVisible();
    return;
  }

  const bottomNav = page.locator("nav.app-bottom-nav");
  await expect(bottomNav).toBeVisible();
  for (const label of ["Map", "Explore", "You"]) {
    await expect(bottomNav.getByRole("link", { name: label })).toBeVisible();
  }
}

async function expectExploreReady(page: Page) {
  await expect(page.getByRole("heading", { name: "South End" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Venue results" }).getByRole("link", { name: "Open Cross Device Pulse", exact: true })).toBeVisible();
}

test.describe("@device NV-TEST-039 cross-device browser sweep", () => {
  test.describe.configure({ timeout: 75_000 });

  test("@device onboarding zone select opens Explore", async ({ page }, testInfo) => {
    await clearClientState(page);
    await mockVenueApis(page);

    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("dialog", { name: /your city's nightlife, live/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Get Started" }).click();
    const zoneDialog = page.getByRole("dialog", { name: /where do you go out/i });
    await expect(zoneDialog).toBeVisible();
    await zoneDialog.getByRole("button", { name: "South End", exact: true }).click();
    await zoneDialog.getByRole("button", { name: "Let's Go" }).click();
    await expect(page.getByRole("dialog", { name: /stay in the loop/i })).toBeVisible();
    await page.getByRole("button", { name: "Maybe later" }).click();

    await expect(page).toHaveURL(/\/explore/);
    await expectExploreReady(page);
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device Explore shows skeleton and open-now badge", async ({ page }, testInfo) => {
    await markOnboarded(page);
    const { releaseFirstVenueResponse } = await mockVenueApis(page, { holdFirstVenueRequest: true });

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("status", { name: "Loading venue card" }).first()).toBeVisible();
    releaseFirstVenueResponse();
    await expectExploreReady(page);

    const venueCard = page.getByRole("region", { name: "Venue results" }).getByRole("link", { name: "Open Cross Device Pulse", exact: true });
    await expect(venueCard).toContainText("Open");
    await expect(venueCard).toContainText("Packed");

    await expectExploreReady(page);
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device venue card opens map bottom sheet with venue details", async ({ page }, testInfo) => {
    await markOnboarded(page);
    await mockVenueApis(page);

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const mapSheet = page.getByRole("region", { name: "South End venues" });
    await expect(mapSheet).toBeVisible({ timeout: 25_000 });
    await mapSheet.getByRole("button", { name: /Expand South End venue list/ }).click();
    await mapSheet.getByRole("button", { name: /Cross Device Pulse/ }).click();

    await expect(mapSheet.getByRole("heading", { level: 2, name: "Cross Device Pulse" })).toBeVisible();
    await expect(mapSheet.getByText("Open").first()).toBeVisible();
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device venue detail shows venue hero and share button", async ({ page, request }, testInfo) => {
    await markOnboarded(page);
    const venue = await getLaunchVenue(request);
    const venuePath = venue.slug ?? venue.id;

    await page.goto(`/venues/${encodeURIComponent(venuePath)}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Venue hero" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share venue" }).first()).toBeVisible();
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });
});
