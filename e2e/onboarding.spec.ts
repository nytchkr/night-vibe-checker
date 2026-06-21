import { expect, test } from "@playwright/test";

test.describe("Onboarding overlay", () => {
  test("fresh page shows onboarding and Skip dismisses it", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/map");

    const overlay = page.getByRole("dialog", { name: /know before you go/i });
    await expect(overlay).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

    await page.getByRole("button", { name: "Skip" }).click();

    await expect(overlay).toHaveCount(0);
    await expect(page.evaluate(() => window.localStorage.getItem("nightvibe.onboarded"))).resolves.toBe("1");
  });
});
