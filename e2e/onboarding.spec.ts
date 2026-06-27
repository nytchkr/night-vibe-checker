import { expect, test } from "@playwright/test";

test.describe("Onboarding overlay", () => {
  test.describe.configure({ mode: "serial" });

  test("fresh page shows onboarding and Skip dismisses it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    const overlay = page.getByRole("dialog", { name: /find where charlotte goes tonight/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay.getByRole("button", { name: /^South End\b/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /^Dilworth\b/ })).toBeVisible();
    await expect(overlay.getByRole("button", { name: /^South Park\b/ })).toBeVisible();
    await expect(overlay.getByText("18 spots", { exact: true })).toBeVisible();
    await expect(overlay.getByText("12 spots", { exact: true })).toBeVisible();
    await expect(overlay.getByText("8 spots", { exact: true })).toBeVisible();

    await overlay.getByRole("button", { name: "What is nytchkr?" }).click();
    await expect(overlay.getByRole("tooltip")).toContainText("real Charlotte nightlife spots");

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
    await page.goto("/map?onboarding=1", { waitUntil: "domcontentloaded" });

    const overlay = page.getByRole("dialog", { name: /find where charlotte goes tonight/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await overlay.getByRole("button", { name: /^South Park\b/ }).click();
    await expect(overlay.getByRole("button", { name: /^South Park\b/ })).toContainText("✓");
    await expect(page.evaluate(() => window.localStorage.getItem("nv_preferred_zone"))).resolves.toBe("south-park-charlotte");

    await expect(page).toHaveURL(/\/explore\?zone=south-park-charlotte/);
    await expect(page.evaluate(() => window.localStorage.getItem("nv_onboarded"))).resolves.toBe("true");
    await expect(page.evaluate(() => window.localStorage.getItem("nv_preferred_zone"))).resolves.toBe("south-park-charlotte");
  });
});
