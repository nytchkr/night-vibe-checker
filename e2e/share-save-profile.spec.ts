import { expect, test } from "@playwright/test";

test.describe("Removed legacy share/save scope", () => {
  test.skip("Share cards, saved spots, and /api/vibe-check reports are out of scope for the consumer-only MVP", async () => {});
});

test.describe("Profile consumer auth surface", () => {
  test("logged-out profile shows pitch card with sign-up CTA", async ({ page }) => {
    await page.goto("/profile");

    // Per NV-UX-CLAUDE-001: profile now shows pitch card for guests instead of redirecting
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText("Your Night Out HQ")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign up free/i })).toBeVisible();
  });
});
