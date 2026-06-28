import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type TestVenue = {
  id: string;
  name: string;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
};

test.use({ serviceWorkers: "block" });

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nightvibe.onboarded", "1");
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
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

test("@device venue detail shows gradient photo fallback when photo_url is missing", async ({ page, request }) => {
  await markOnboarded(page);
  await preventFetchedVenuePhotos(page);

  const venue = await getNoPhotoVenue(request);
  test.skip(!venue, "No cached launch-zone venue without photo_url/photoUrls was available from /api/venues");

  await page.goto(`/venues/${venue!.id}`);

  await expect(page.getByRole("heading", { level: 1, name: venue!.name })).toBeVisible({ timeout: 15_000 });

  const photoRegion = page.getByLabel(`${venue!.name} photos`);
  await expect(photoRegion).toBeVisible();

  await expect(photoRegion).toBeVisible();
  await expect.poll(async () => {
    return photoRegion.evaluate((element) => getComputedStyle(element).backgroundImage);
  }).toContain("gradient");

  await expect(photoRegion.locator("img")).toHaveCount(0);
  await expect(page.locator('img[src=""], img[src="null"]')).toHaveCount(0);
});
