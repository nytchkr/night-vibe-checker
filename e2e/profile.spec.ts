import { expect, test } from "@playwright/test";

test.describe("Profile page", () => {
  test("profile shows pitch card to guest (no redirect)", async ({ page }) => {
    await page.goto("/profile");

    // Per NV-UX-CLAUDE-001: guests see pitch card, not a redirect
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText("Your Night Out HQ")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign up free/i })).toBeVisible();
  });
});
