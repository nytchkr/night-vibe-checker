import { expect, test } from "@playwright/test";

test.describe("Login page", () => {
  test("login page renders with email input", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
  });

  test("login page shows Google OAuth button", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });
});
