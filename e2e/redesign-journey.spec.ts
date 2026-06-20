import { expect, test, type Page } from "@playwright/test";

const initialReport = {
  id: "ci-e2e-001",
  venueId: "place_e2e_001",
  placeId: "place_e2e_001",
  venueName: "The Midnight Lounge",
  busyness: "packed",
  crowdFeel: "balanced",
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

const submittedReport = {
  id: "ci-e2e-submitted",
  venueId: "place_e2e_001",
  placeId: "place_e2e_001",
  venueName: "The Midnight Lounge",
  busyness: "packed",
  crowdFeel: "mostly_male",
  note: "Line is moving",
  createdAt: new Date().toISOString(),
};

const meta = {
  cached: false,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-redesign-journey",
};

async function mockFeed(page: Page, reports = [initialReport]) {
  await page.route("**/api/check-ins?limit=20", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { checkIns: reports },
        meta,
      }),
    }),
  );
}

async function addLocalSession(page: Page) {
  const session = {
    access_token: "valid-e2e-token",
    refresh_token: "refresh-e2e-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "user-e2e",
      aud: "authenticated",
      role: "authenticated",
      email: "journey-e2e@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  await page.addInitScript((authSession) => {
    for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
      window.localStorage.setItem(key, JSON.stringify(authSession));
    }
  }, session);
}

test.describe("NV-067 redesign consumer journey", () => {
  test("open app, report from feed, and see the submitted venue on return", async ({ page }) => {
    await addLocalSession(page);

    let feedReports = [initialReport];
    await page.route("**/api/check-ins?limit=20", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { checkIns: feedReports },
          meta,
        }),
      }),
    );

    await page.route("**/api/check-ins", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      feedReports = [submittedReport];
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { checkIn: submittedReport },
          meta,
        }),
      });
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "How's South End tonight?" })).toBeVisible();
    await expect(page.getByText("The Midnight Lounge")).toBeVisible();
    await expect(page.getByText("Packed")).toBeVisible();

    await page.getByRole("link", { name: "Report →" }).first().click();
    await expect(page).toHaveURL(/\/vibe-check\?venueId=place_e2e_001/);
    await expect(page.getByRole("heading", { name: "The Midnight Lounge" })).toBeVisible();

    await page.getByRole("button", { name: "PACKED" }).click();
    await page.getByRole("button", { name: "MOSTLY GUYS" }).click();
    await page.getByPlaceholder("What's the vibe?").fill("Line is moving");
    await page.getByRole("button", { name: "Report Vibe" }).click();

    await expect(page.getByText("Vibe reported ✓")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("The Midnight Lounge")).toBeVisible();
    await expect(page.getByText("Packed")).toBeVisible();
  });

  test("guest report attempt redirects to login with a return URL", async ({ page }) => {
    await mockFeed(page);

    await page.goto("/");
    await page.getByRole("link", { name: "Report →" }).first().click();
    await page.getByRole("button", { name: "PACKED" }).click();
    await page.getByRole("button", { name: "MOSTLY GUYS" }).click();
    await page.getByRole("button", { name: "Report Vibe" }).click();

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(decodeURIComponent(page.url())).toContain("/vibe-check?venueId=place_e2e_001");
  });

  test("bottom nav exposes Feed, Report, and Me only", async ({ page }) => {
    await mockFeed(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Report" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Me" })).toBeVisible();
  });
});
