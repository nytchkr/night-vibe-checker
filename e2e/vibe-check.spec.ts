import { expect, test } from "@playwright/test";

test.describe("Removed legacy AI vibe-check scope", () => {
  test.skip("Old /api/vibe-check, vibe scores, photo analysis, save, and share flows were removed from the consumer MVP", async () => {});
});

test.describe("Consumer report form", () => {
  test("renders the current busyness and crowd-feel controls", async ({ page }) => {
    await page.goto("/vibe-check?venueId=place-e2e&venueName=The%20Midnight%20Lounge");

    await expect(page.getByRole("heading", { name: "The Midnight Lounge" })).toBeVisible();
    await expect(page.getByText("How busy is it?")).toBeVisible();
    await expect(page.getByRole("button", { name: "DEAD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "MODERATE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PACKED" })).toBeVisible();
    await expect(page.getByText("Crowd feel")).toBeVisible();
    await expect(page.getByRole("button", { name: "MOSTLY GUYS" })).toBeVisible();
    await expect(page.getByRole("button", { name: "MOSTLY GIRLS" })).toBeVisible();
    await expect(page.getByRole("button", { name: "BALANCED" })).toBeVisible();
    await expect(page.getByRole("button", { name: "MIXED" })).toBeVisible();
  });

  test("requires venue, busyness, and crowd feel before enabling submit", async ({ page }) => {
    await page.goto("/vibe-check");

    const submit = page.getByRole("button", { name: "Report Vibe" });
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("Venue name").fill("The Neon Lounge");
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: "PACKED" }).click();
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: "MIXED" }).click();
    await expect(submit).toBeEnabled();
  });

  test("does not render removed AI/report-result UI", async ({ page }) => {
    await page.goto("/vibe-check");

    await expect(page.getByText(/vibe score/i)).toHaveCount(0);
    await expect(page.getByText(/upload/i)).toHaveCount(0);
    await expect(page.getByText(/save spot/i)).toHaveCount(0);
    await expect(page.getByText(/share card/i)).toHaveCount(0);
  });
});
