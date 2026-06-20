import { expect, test } from "@playwright/test";

test.describe("Profile page", () => {
  test("profile redirects guest to login", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/login\?return=\/profile/);
  });
});
