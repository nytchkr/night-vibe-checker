import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type TestVenue = {
  id: string;
  name: string;
};

const meta = {
  cached: true,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-share",
};

async function getShareVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const venue = body?.data?.venues?.[0] as TestVenue | undefined;
  expect(venue, "expected at least one cached launch-zone venue").toBeTruthy();
  return venue;
}

async function mockCheckIns(page: Page) {
  await page.route("**/api/check-ins?**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.pathname !== "/api/check-ins") {
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

test.describe("Venue detail share", () => {
  test("shares a venue detail link through native share or clipboard fallback", async ({ page, request }) => {
    const venue = await getShareVenue(request);
    await mockCheckIns(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("nv_onboarded", "1");
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.localStorage.setItem("e2e_copied_url", value);
          },
        },
      });
    });

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    const shareButton = page.getByRole("button", { name: "Share vibe report" });
    await expect(shareButton).toBeVisible();

    await shareButton.click();

    // "Link copied!" is in title attribute (tooltip) not visible text; verify clipboard write instead
    await expect(page.evaluate(() => window.localStorage.getItem("e2e_copied_url"))).resolves.toContain(
      `/venues/${venue.id}`,
    );
  });
});
