import { expect, test } from "@playwright/test";

test.describe("Internal Tickets route", () => {
  test("renders the internal ticket board without the consumer bottom nav", async ({ page }) => {
    await page.goto("/internal/tickets");

    await expect(page.getByRole("heading", { name: "Internal Tickets" })).toBeVisible();
    await expect(page.getByText("Internal Agent Work Only")).toBeVisible();
    await expect(page.getByText("Production read-only view of Claude/Codex agent tickets")).toBeVisible();
    await expect(page.getByText("NV-BUG-008")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  });
});
