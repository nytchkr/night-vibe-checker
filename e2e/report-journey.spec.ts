import { expect, test, type Page } from "@playwright/test";

const meta = {
  cached: true,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-report-journey",
};

const reportVenue = {
  id: "venue-report-journey-1",
  placeId: "place-report-journey-1",
  zoneId: "south-end",
  name: "Report Journey Club",
  address: "123 Report Ave",
  lat: 42.34,
  lng: -71.07,
  category: "night_club",
  photoUrl: null,
  hidden: false,
  signal: {
    venueId: "venue-report-journey-1",
    placeId: "place-report-journey-1",
    busyness0To100: 82,
    busynessSource: "live",
    mfRatio: 51,
    confidence0To1: 0.78,
    sampleSize: 6,
    computedAt: new Date().toISOString(),
    lastBusynessRefresh: new Date().toISOString(),
  },
};

async function mockHomeVenues(page: Page) {
  await page.route("**/api/venues", (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [reportVenue] },
        meta,
      }),
    });
  });
}

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

test.describe("NV-TEST-001 report journey auth gate", () => {
  test("routes a guest home report CTA to login with a return parameter", async ({ page }) => {
    await markOnboarded(page);

    // Premium redesign: explore cards don't carry inline "Sign in" CTAs.
    // Auth gate at /vibe-check — direct navigation triggers the login redirect.
    await page.goto(`/vibe-check?venueId=${reportVenue.id}&venueName=Report+Journey+Club`);

    await expect(page).toHaveURL(/\/login\?return=/);
    const url = new URL(page.url());
    expect(url.searchParams.get("return")).toBe(
      `/vibe-check?venueId=${reportVenue.id}&venueName=Report+Journey+Club`,
    );
  });

  test("loads the login page with an email input", async ({ page }) => {
    await page.goto("/login?return=%2Fvibe-check");

    await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NightVibe" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("redirects direct guest vibe-check access to login", async ({ page }) => {
    await page.goto("/vibe-check?venueId=venue-gated-1&venueName=Gated%20Club");

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(new URL(page.url()).searchParams.get("return")).toBe(
      "/vibe-check?venueId=venue-gated-1&venueName=Gated+Club",
    );
    await expect(page.getByRole("button", { name: "Report Vibe" })).toHaveCount(0);
  });
});
