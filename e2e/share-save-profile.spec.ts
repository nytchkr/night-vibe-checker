import { expect, test } from "@playwright/test";

test.describe("Removed legacy share/save scope", () => {
  test.skip("Share cards, saved spots, and /api/vibe-check reports are out of scope for the consumer-only MVP", async () => {});
});

test.describe("Profile consumer auth surface", () => {
  test("redirects logged-out profile access to the login gate", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/login\?return=\/profile/);
    await expect(page.getByRole("heading", { name: "Sign in to report" })).toBeVisible();
    await expect(page.getByPlaceholder("your@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
  });
});
