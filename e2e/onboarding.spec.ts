import { expect, test } from "@playwright/test";

test.describe("Onboarding overlay", () => {
  test.describe.configure({ mode: "serial" });

  test("fresh page shows onboarding and Skip dismisses it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    const overlay = page.getByRole("dialog", { name: /pick your zone/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay.getByRole("button", { name: /South End/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /Dilworth/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /South Park/ })).toBeVisible();
    await expect(overlay.getByText("18 spots", { exact: true })).toBeVisible();
    await expect(overlay.getByText("12 spots", { exact: true })).toBeVisible();
    await expect(overlay.getByText("8 spots", { exact: true })).toBeVisible();

    await overlay.getByRole("button", { name: "Skip" }).click();

    await expect(overlay).toHaveCount(0);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("true");
    await expect(page.evaluate(() => window.localStorage.getItem("nv-selected-zone"))).resolves.toBeNull();
  });

  test("selecting an area stores the zone and opens Explore prefiltered", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    const overlay = page.getByRole("dialog", { name: /pick your zone/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await overlay.getByRole("button", { name: /South Park/ }).click();
    await expect(page.evaluate(() => window.localStorage.getItem("nv-selected-zone"))).resolves.toBe("south-park-charlotte");
    await expect(page.getByRole("dialog", { name: /how it works/i })).toBeVisible();
    await expect(overlay.getByText("Check-in at a venue")).toBeVisible();
    await expect(overlay.getByText("See live busyness")).toBeVisible();
    await expect(overlay.getByText("Discover trending spots")).toBeVisible();
    await overlay.getByRole("button", { name: "Start exploring" }).click();

    await expect(page).toHaveURL(/\/explore\?zone=south-park-charlotte/);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("true");
    await expect(page.evaluate(() => window.localStorage.getItem("nv-selected-zone"))).resolves.toBe("south-park-charlotte");
  });
});
