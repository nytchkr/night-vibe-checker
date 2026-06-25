import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";
import type { ConsumerVenue, PredictionResponse } from "@/types";

const generatedAt = new Date().toISOString();

const meta = {
  cached: true,
  generatedAt,
  requestId: "venue-prediction-e2e",
};

async function getTestVenue(request: APIRequestContext): Promise<ConsumerVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as ConsumerVenue[];
  const venue = venues.find((candidate) => candidate.besttimeVenueId) ?? venues[0];
  expect(venue, "expected at least one cached venue for the detail page").toBeTruthy();
  return venue;
}

async function mockVenueApis(page: Page, venue: ConsumerVenue) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
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

    if (url.pathname === `/api/venues/${venue.id}`) {
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

    if (
      url.pathname === `/api/venues/${venue.id}/activity` ||
      url.pathname === `/api/venues/${venue.id}/check-ins`
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { activity: [], checkIns: [] },
          meta,
        }),
      });
    }

    if (url.pathname === `/api/venues/${venue.id}/besttime-forecast`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { hours: [], updatedOn: null },
          meta,
        }),
      });
    }

    return route.continue();
  });
}

function successPrediction(venueId: string): PredictionResponse {
  return {
    status: "success",
    data: {
      venueId,
      predictions: {
        bestTimeToVisit: {
          dayOfWeek: "Friday",
          hourWindow: "10 PM – 12 AM",
          basis: "BestTime + 5 reports",
        },
        peakCrowdWindow: {
          tonight: null,
          thisWeekend: null,
        },
        vibeTrend: {
          direction: "stable",
          description: "Recent reports are steady.",
        },
        crowdProfileForecast: null,
      },
      dataQuality: {
        checkInCount: 5,
        hasBestTimeData: true,
        confidenceLabel: "high",
      },
      attribution: "BestTime + 5 reports",
      warning: null,
    },
    meta: {
      venueId,
      generatedAt,
      model: "claude-sonnet-4-6",
    },
  };
}

function warningPrediction(venueId: string): PredictionResponse {
  return {
    ...successPrediction(venueId),
    data: {
      ...successPrediction(venueId).data,
      predictions: {
        ...successPrediction(venueId).data.predictions,
        bestTimeToVisit: null,
      },
      dataQuality: {
        checkInCount: 0,
        hasBestTimeData: false,
        confidenceLabel: "insufficient",
      },
      attribution: "Not enough reports yet",
      warning: "Not enough reports yet",
    },
  };
}

async function mockPrediction(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route("**/api/venues/*/predict", handler);
}

test.describe("VenuePredictionCard", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test("shows a skeleton while the AI forecast request is pending", async ({ page, request }) => {
    const venue = await getTestVenue(request);
    await mockVenueApis(page, venue);
    await mockPrediction(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successPrediction(venue.id)),
      });
    });

    await page.goto(`/venues/${venue.id}`);

    await expect(page.locator('[role="status"][aria-label="Loading AI forecast"]')).toBeVisible();
  });

  test("shows the free best-time chip and three locked forecast chips", async ({ page, request }) => {
    const venue = await getTestVenue(request);
    await mockVenueApis(page, venue);
    await mockPrediction(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successPrediction(venue.id)),
      }),
    );

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByText("AI forecast", { exact: true })).toBeVisible();
    const bestTimeChip = page
      .getByText("Best tonight: 10 PM – 12 AM")
      .locator('xpath=ancestor::div[contains(@class, "border-[#8B6CFF]/45")]');
    await expect(bestTimeChip).toBeVisible();
    await expect(bestTimeChip.locator("svg").first()).toBeVisible();
    await expect(page.getByText("Unlock later")).toHaveCount(3);
  });

  test("shows an empty state when the prediction response has a warning", async ({ page, request }) => {
    const venue = await getTestVenue(request);
    await mockVenueApis(page, venue);
    await mockPrediction(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(warningPrediction(venue.id)),
      }),
    );

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByText("Not enough reports yet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Best time tonight" })).toHaveCount(0);
  });

  test("falls back gracefully when the prediction endpoint returns 502", async ({ page, request }) => {
    const venue = await getTestVenue(request);
    await mockVenueApis(page, venue);
    await mockPrediction(page, (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          error: { code: "UPSTREAM_ERROR", message: "Prediction unavailable." },
          meta,
        }),
      }),
    );

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    await expect(page.getByText("Not enough reports yet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Best time tonight" })).toHaveCount(0);
  });
});
