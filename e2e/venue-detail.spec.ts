import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

type TestVenue = {
  id: string;
  placeId: string;
  name: string;
  address: string;
  signal: {
    busyness0To100: number | null;
    mfRatio: number | null;
  } | null;
};

const meta = {
  cached: true,
  generatedAt,
  requestId: "nv-test-004-venue-detail",
};

async function getTestVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as TestVenue[];
  const venue = venues.find((candidate) => candidate.signal?.mfRatio != null) ?? venues[0];
  expect(venue, "expected at least one cached launch-zone venue").toBeTruthy();
  return venue;
}

async function mockVenueListApis(page: Page, venue: TestVenue) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });

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
          data: { venues: [venue] },
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

test.describe("NV-TEST-004 venue detail", () => {
  test("nonexistent venue id returns 404", async ({ request }) => {
    const r = await request.get("/venues/does-not-exist-xyz-123");
    const body = await r.text();

    expect([200, 404]).toContain(r.status());
    expect(body).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  test("clicking a venue card navigates to the venue detail page", async ({ page, request }) => {
    const venue = await getTestVenue(request);
    await mockVenueListApis(page, venue);

    await page.goto("/explore");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("link", { name: `Open ${venue.name}` }).click();

    await expect(page).toHaveURL(`/venues/${venue.id}`);
    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
  });

  test("venue detail page shows current vibe and M/F crowd sections", async ({ page, request }) => {
    const venue = await getTestVenue(request);

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    await expect(page.getByText(venue.address).first()).toBeVisible();
    // Signal section: current redesign shows "Right now"; older signal-rich state shows "Capacity".
    await expect(page.getByText(/Right now|Capacity/i).first()).toBeVisible();
    // M/F split row: shows percent breakdown or the empty "No reads yet" state.
    await expect(page.getByText(/No reads yet|% M|% ·|check-ins/i).first()).toBeVisible();
  });

  test("venue detail page exposes the share button without invoking share", async ({ page, request }) => {
    const venue = await getTestVenue(request);

    await page.goto(`/venues/${venue.id}`);

    // ShareButton uses aria-label="Share vibe report" (not venue name)
    await expect(page.getByRole("button", { name: /Share/i })).toBeVisible();
  });

  test("venue detail page has a Google Maps directions link", async ({ page, request }) => {
    const venue = await getTestVenue(request);

    await page.goto(`/venues/${venue.id}`);

    const directions = page.getByRole("link", { name: /Open in Google Maps|Get Directions|Google Maps/i });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute("href", /google\.com\/maps/);
  });

  test("venue detail page keeps the redesigned sticky report action", async ({ page, request }) => {
    const venue = await getTestVenue(request);

    await page.goto(`/venues/${venue.id}`);

    const reportAction = page.getByRole("link", { name: /Check In|Report Vibe/i });
    await expect(reportAction).toBeVisible();
    await expect(reportAction).toHaveAttribute("href", new RegExp(`/vibe-check\\?.*venueId=${venue.id}`));
  });

  test("unauthenticated heart button links to login", async ({ page, request }) => {
    const venue = await getTestVenue(request);

    await page.goto(`/venues/${venue.id}`);

    const saveLink = page.getByRole("link", { name: "Save venue" });
    await expect(saveLink).toBeVisible();
    await expect(saveLink).toHaveAttribute("href", /\/login/);
  });
});
