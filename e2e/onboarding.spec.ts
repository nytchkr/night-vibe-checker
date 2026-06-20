import { expect, test, type Page } from "@playwright/test";

async function mockHomeVenues(page: Page) {
  await page.route("**/api/venues", (route) => {
    if (route.request().method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [] },
        meta: {
          cached: true,
          generatedAt: new Date().toISOString(),
          requestId: "e2e-onboarding",
        },
      }),
    });
  });
}

test.describe("Onboarding overlay", () => {
  test("fresh page shows onboarding and Skip dismisses it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await mockHomeVenues(page);

    await page.goto("/explore");

    const overlay = page.getByRole("dialog", { name: /know before you go/i });
    await expect(overlay).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

    await page.getByRole("button", { name: "Skip" }).click();

    await expect(overlay).toHaveCount(0);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("1");
  });
});
