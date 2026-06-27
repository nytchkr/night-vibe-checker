import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
    mfRatio: number | null;
    confidence0To1: number;
    sampleSize: number;
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
      mfRatio: 52,
      confidence0To1: 0.86,
      sampleSize: 19,
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
      mfRatio: 48,
      confidence0To1: 0.72,
      sampleSize: 11,
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

async function mockVenueApis(page: Page, options: { delayVenuesMs?: number } = {}) {
  let venueListRequests = 0;

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

    if (url.pathname === "/api/venues" || url.pathname === "/api/venues/trending") {
      venueListRequests += 1;
      if (venueListRequests === 1 && options.delayVenuesMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayVenuesMs));
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

    if (childRoute === "check-ins") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ checkIns: [] }),
      });
    }

    if (childRoute === "activity") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
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

async function performPullToRefresh(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const x = Math.floor(page.viewportSize()!.width / 2);
  await page.mouse.move(x, 24);
  await page.mouse.down();
  await page.mouse.move(x, 148, { steps: 8 });
  await expect(page.getByText("Pull to refresh")).toBeVisible({ timeout: 5_000 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toBeVisible({ timeout: 5_000 });
}

test.describe("@device NV-TEST-039 cross-device browser sweep", () => {
  test.describe.configure({ timeout: 75_000 });

  test("@device onboarding zone select opens Explore", async ({ page }, testInfo) => {
    await clearClientState(page);
    await mockVenueApis(page);

    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    const overlay = page.getByRole("dialog", { name: /find where charlotte goes tonight/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await overlay.getByRole("button", { name: /^South End\b/ }).click();

    await expect(page).toHaveURL(/\/explore\?zone=south-end-charlotte/);
    await expectExploreReady(page);
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device Explore shows skeleton, open-now badge, and pull-to-refresh", async ({ page }, testInfo) => {
    await markOnboarded(page);
    await mockVenueApis(page, { delayVenuesMs: 650 });

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("status", { name: "Loading venue card" }).first()).toBeVisible();
    await expectExploreReady(page);

    const venueCard = page.getByRole("region", { name: "Venue results" }).getByRole("link", { name: "Open Cross Device Pulse", exact: true });
    await expect(venueCard).toContainText("Open now");
    await expect(venueCard).toContainText("Packed");

    await performPullToRefresh(page);
    await expectExploreReady(page);
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device venue card opens map bottom sheet with check-in action", async ({ page }, testInfo) => {
    await markOnboarded(page);
    await mockVenueApis(page);

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const mapSheet = page.getByRole("region", { name: "South End venues" });
    await expect(mapSheet).toBeVisible({ timeout: 25_000 });
    await mapSheet.getByRole("button", { name: /Expand Charlotte venue list/ }).click();
    await mapSheet.getByRole("button", { name: /Cross Device Pulse/ }).click();

    await expect(mapSheet.getByRole("heading", { name: "Cross Device Pulse" })).toBeVisible();
    await expect(mapSheet.getByRole("link", { name: "Check in →" })).toBeVisible();
    await expect(mapSheet.getByText("Open now").first()).toBeVisible();
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });

  test("@device venue detail shows check-in CTA and share button", async ({ page }, testInfo) => {
    await markOnboarded(page);
    await mockVenueApis(page);

    await page.goto("/venues/cross-device-pulse", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "Cross Device Pulse" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Venue hero" })).toBeVisible();
    await expect(page.getByText("Open now").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Check in at Cross Device Pulse" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Share Cross Device Pulse/i }).first()).toBeVisible();
    await assertShellNavigation(page, testInfo);
    await assertNoHorizontalOverflow(page);
  });
});
