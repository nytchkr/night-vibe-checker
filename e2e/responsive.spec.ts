import { expect, test, type Page } from "@playwright/test";

const meta = {
  cached: true,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-responsive",
};

test.use({ serviceWorkers: "block" });

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nightvibe.onboarded", "1");
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function mockVenues(page: Page) {
  await page.route("**/api/venues**", (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET" || !url.pathname.startsWith("/api/venues")) {
      return route.continue();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [] },
        meta,
      }),
    });
  });
}

function bottomNav(page: Page) {
  return page.locator("nav.app-bottom-nav, nav[class*='BottomNav']");
}

function sidebarNav(page: Page) {
  return page.locator("nav.app-sidebar");
}

test.describe("responsive app navigation", () => {
  test.beforeEach(async ({ page }) => {
    await markOnboarded(page);
    await mockVenues(page);
  });

  test("shows bottom navigation and hides sidebar on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.locator("#main-content")).toBeVisible();
    await expect(bottomNav(page)).toBeVisible();
    await expect(sidebarNav(page)).not.toBeVisible();
  });

  test("shows sidebar navigation and hides bottom navigation on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const sidebar = sidebarNav(page);
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("nytchkr")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Map" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Explore" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "You" })).toBeVisible();
    await expect(bottomNav(page)).not.toBeVisible();
  });

  test("keeps tablet layout stable with bottom navigation below the desktop breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    await expect(page.locator("#main-content")).toBeVisible();
    await expect(bottomNav(page)).toBeVisible();
    await expect(sidebarNav(page)).not.toBeVisible();
    await expect(page.getByText("Could not load venues.")).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("routes desktop sidebar links to map and explore", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const sidebar = sidebarNav(page);
    await expect(sidebar).toBeVisible();

    await sidebar.getByRole("link", { name: "Map" }).click();
    await expect(page).toHaveURL(/\/map$/);

    await sidebar.getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/explore$/);
  });
});
