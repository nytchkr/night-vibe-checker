import { expect, test } from "@playwright/test";

test.describe("Removed legacy share/save scope", () => {
  test.skip("Share cards, saved spots, and /api/vibe-check reports are out of scope for the consumer-only MVP", async () => {});
});

test.describe("Profile consumer auth surface", () => {
  test("shows Your Reports and a lightweight sign-in section when logged out", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Your Reports" })).toBeVisible();
    await expect(page.getByText("See your reports, track your impact")).toBeVisible();
    await expect(page.getByPlaceholder("your@email.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
