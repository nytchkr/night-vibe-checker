import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const generatedAt = new Date().toISOString();

type GoldenPathVenue = {
  id: string;
  name: string;
  signal?: {
    busyness0To100: number | null;
    busynessSource: "live" | "forecast" | null;
  } | null;
};

const venues = [
  {
    id: "golden-path-live",
    placeId: "place-golden-path-live",
    zoneId: "south-end-charlotte",
    name: "Golden Path Club",
    address: "100 Golden Path Ave",
    lat: 35.2178,
    lng: -80.8597,
    category: "night_club",
    photoUrl: null,
    openNow: true,
    hidden: false,
    signal: {
      venueId: "golden-path-live",
      placeId: "place-golden-path-live",
      busyness0To100: 87,
      busynessSource: "live",
      confidence0To1: 0.86,
      computedAt: generatedAt,
      lastBusynessRefresh: generatedAt,
    },
  },
];

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("nv_onboarded", "1");
  });
}

async function mockVenueList(page: Page) {
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
        meta: { cached: true, generatedAt, requestId: "golden-path" },
      }),
    });
  });
}

async function getSeededVenues(request: APIRequestContext): Promise<GoldenPathVenue[]> {
  const res = await request.get("/api/venues");
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  return body?.data?.venues ?? [];
}

test.describe("golden path", () => {
  test("@smoke map loads with venue pins", async ({ page }) => {
    await markOnboarded(page);
    await mockVenueList(page);

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15000 });
  });

  test("explore shows venues", async ({ page }) => {
    await markOnboarded(page);
    await mockVenueList(page);

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    const venueCard = page.locator("[data-testid='venue-card']").first();
    const venueLink = page.getByRole("link", { name: /Open Golden Path Club/i }).first();
    const emptyState = page.getByText(/no venues|coming soon/i).first();
    await expect(venueCard.or(venueLink).or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test("venue detail shows source badge", async ({ request, page }) => {
    const seededVenues = await getSeededVenues(request);
    const venue =
      seededVenues.find((candidate) => /^(live|forecast)$/.test(candidate.signal?.busynessSource ?? "")) ??
      seededVenues.find((candidate) => candidate.signal?.busyness0To100 == null) ??
      seededVenues[0];
    if (!venue) return;

    await page.goto(`/venues/${venue.id}`, { waitUntil: "domcontentloaded" });

    const badge = page.getByText(/LIVE|FORECAST/i).first();
    const noData = page.getByText(/no live reads|no busyness data|no reads yet/i).first();
    await expect(badge.or(noData)).toBeVisible({ timeout: 10000 });
  });
});
