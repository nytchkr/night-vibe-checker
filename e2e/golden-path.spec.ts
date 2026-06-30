import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { ConsumerVenue } from "@/types";

type VenueApiBody = {
  data?: {
    venues?: ConsumerVenue[];
  };
};

function hasPhoto(venue: ConsumerVenue): boolean {
  return Boolean(venue.photoUrl ?? venue.photoUrls?.[0] ?? venue.photo_urls?.[0]);
}

function hasBusyness(venue: ConsumerVenue): boolean {
  return typeof venue.signal?.busyness0To100 === "number";
}

function getBusynessLabel(value: number): "Packed" | "Moderate" | "Dead" {
  if (value >= 67) return "Packed";
  if (value >= 34) return "Moderate";
  return "Dead";
}

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("nv_onboarded", "1");
  });
}

async function getGoldenPathVenue(request: APIRequestContext): Promise<ConsumerVenue> {
  const res = await request.get("/api/venues");
  expect(res.ok()).toBeTruthy();

  const body = (await res.json()) as VenueApiBody;
  const venues = body.data?.venues?.filter((venue) => !venue.hidden) ?? [];
  expect(venues.length, "golden path needs at least one visible seeded venue").toBeGreaterThan(0);

  const venue =
    venues.find((candidate) => hasPhoto(candidate) && hasBusyness(candidate) && candidate.address && candidate.category) ??
    venues.find((candidate) => hasBusyness(candidate) && candidate.address && candidate.category) ??
    venues[0];

  expect(venue?.id, "selected venue should have an id").toBeTruthy();
  expect(venue?.name, "selected venue should have a name").toBeTruthy();
  expect(venue?.category, "selected venue should have a category").toBeTruthy();
  expect(venue?.address, "selected venue should have an address").toBeTruthy();
  expect(venue?.signal?.busyness0To100, "selected venue should have a busyness value").toEqual(expect.any(Number));

  return venue;
}

async function mockVenueFeeds(page: Page, venues: ConsumerVenue[]) {
  await page.route("**/api/venues/trending", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: venues.slice(0, 1) },
        meta: { cached: true, generatedAt: new Date().toISOString() },
      }),
    });
  });

  await page.route("**/api/venues/*/tips", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "success", data: { tips: [] } }),
    });
  });

  await page.route("**/api/track", async (route) => {
    return route.fulfill({
      status: 204,
      contentType: "application/json",
      body: "",
    });
  });

  await page.route("**/api/venues", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues },
        meta: { cached: true, generatedAt: new Date().toISOString(), requestId: "golden-path" },
      }),
    });
  });
}

test.describe("nytchkr discovery golden path", () => {
  test("@smoke app redirects to Explore and shows seeded venue cards", async ({ request, page }) => {
    const venue = await getGoldenPathVenue(request);
    await markOnboarded(page);
    await mockVenueFeeds(page, [venue]);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole("heading", { name: "Explore Charlotte" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Venue results" })).toBeVisible();

    const venueLink = page.getByRole("link", { name: new RegExp(`Open ${venue.name}`, "i") }).first();
    await expect(venueLink).toBeVisible();
    await expect(venueLink.getByRole("heading", { name: venue.name })).toBeVisible();
    await expect(venueLink.getByText(venue.category, { exact: false })).toBeVisible();

    const busyness = venue.signal?.busyness0To100;
    expect(busyness).toEqual(expect.any(Number));
    await expect(venueLink.getByText(getBusynessLabel(busyness as number))).toBeVisible();
  });

  test("@smoke tapping a venue card opens a detail page with identity, address, photo, and busyness", async ({ request, page }) => {
    const venue = await getGoldenPathVenue(request);
    await markOnboarded(page);
    await mockVenueFeeds(page, [venue]);

    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: new RegExp(`Open ${venue.name}`, "i") }).first().click();

    await expect(page).toHaveURL(new RegExp(`/venues/${venue.id}`));
    await expect(page.getByRole("heading", { name: venue.name }).first()).toBeVisible();
    await expect(page.getByRole("group", { name: `${venue.name} photos` })).toBeVisible();
    await expect(page.getByText(venue.address, { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "BestTime busyness meter" })).toBeVisible();
    await expect(page.getByText(`${venue.signal?.busyness0To100}%`)).toBeVisible();
  });

  test("@smoke Map tab renders pins and opens the venue bottom sheet from a pin", async ({ request, page }) => {
    const venue = await getGoldenPathVenue(request);
    await markOnboarded(page);
    await mockVenueFeeds(page, [venue]);

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
    const pin = page.getByRole("button", { name: `Open ${venue.name} details` }).first();
    await expect(pin).toBeVisible({ timeout: 15_000 });
    await pin.click();

    const sheet = page.getByRole("region", { name: /Charlotte venues|South End venues/i });
    await expect(sheet.getByRole("heading", { name: venue.name })).toBeVisible();
    await expect(sheet.getByText(venue.address, { exact: false })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /View details/i })).toBeVisible();
  });

  test("@smoke You tab shows the signed-out prompt", async ({ page }) => {
    await markOnboarded(page);

    await page.goto("/you", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Sign in to save your favorite spots" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });
});
