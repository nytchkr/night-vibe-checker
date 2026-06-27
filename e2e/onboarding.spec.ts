import { expect, test } from "@playwright/test";

test.describe("Onboarding overlay", () => {
  test("fresh page shows onboarding and Skip dismisses it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map");

    const overlay = page.getByRole("dialog", { name: /find where charlotte goes tonight/i });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole("button", { name: /^South End\b/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /^Dilworth\b/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /^South Park\b/ })).toBeVisible();

    await overlay.getByRole("button", { name: "Skip, show me everything" }).click();

    await expect(overlay).toHaveCount(0);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("true");
    await expect(page.evaluate(() => window.localStorage.getItem("nv_preferred_zone"))).resolves.toBeNull();
  });

  test("selecting an area stores the zone and opens Explore prefiltered", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map");

    const overlay = page.getByRole("dialog", { name: /find where charlotte goes tonight/i });
    await expect(overlay).toBeVisible();
    await overlay.getByRole("button", { name: /^South Park\b/ }).click();

    await expect(page).toHaveURL(/\/explore\?zone=south-park-charlotte/);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("true");
    await expect(page.evaluate(() => window.localStorage.getItem("nv_preferred_zone"))).resolves.toBe("south-park-charlotte");
  });
});
