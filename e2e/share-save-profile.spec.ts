import { expect, test } from "@playwright/test";

test.describe("Removed legacy share/save scope", () => {
  test.skip("Share cards, saved spots, and /api/vibe-check reports are out of scope for the consumer-only MVP", async () => {});
});

test.describe("Profile consumer auth surface", () => {
  test("logged-out profile redirects to login", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/login\?return=%2Fprofile/);
    await expect(page.getByRole("heading", { name: "NightVibe" })).toBeVisible();
  });
});
