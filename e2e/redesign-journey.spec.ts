import { expect, test, type Locator } from "@playwright/test";

async function expectPressed(button: Locator) {
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function expectPackedActive(button: Locator) {
  await expectPressed(button);
  await expect
    .poll(async () =>
      button.evaluate((element) => getComputedStyle(element).borderColor),
    )
    .toBe("rgb(239, 68, 68)");
}

test.describe("NV-067 full VibeCheck consumer journey", () => {
  test("opens feed, starts a report, completes required choices, and reaches the expected submit gate", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await test.step("1. Open the local feed and see at least one venue card", async () => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "How's South End tonight?" })).toBeVisible();
      await expect(page.getByText("Could not load tonight's reports.")).toHaveCount(0);
      await expect(page.getByText("No reports tonight")).toHaveCount(0);

      const firstCard = page.locator("main li").first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.getByRole("link", { name: "Report →" })).toBeVisible();

      const venueName = (await firstCard.locator("p").first().innerText()).trim();
      expect(venueName.length).toBeGreaterThan(0);
    });

    const firstCard = page.locator("main li").first();
    const venueName = (await firstCard.locator("p").first().innerText()).trim();

    await test.step("2. Click Report from a feed card and land on a prefilled report URL", async () => {
      await firstCard.getByRole("link", { name: "Report →" }).click();
      await expect(page).toHaveURL(/\/vibe-check\?venueId=[^&]+&venueName=/);
      await expect(page.getByRole("heading", { name: venueName })).toBeVisible();
    });

    await test.step("3. Select PACKED and verify the red active state", async () => {
      const packed = page.getByRole("button", { name: "PACKED" });
      await packed.click();
      await expectPackedActive(packed);
    });

    await test.step("4. Select a crowd feel and verify the active state", async () => {
      const crowdFeel = page.getByRole("button", { name: "MOSTLY GUYS" });
      await crowdFeel.click();
      await expectPressed(crowdFeel);
    });

    await test.step("5. Submit and verify auth gate or successful report", async () => {
      await page.getByRole("button", { name: "Report Vibe" }).click();

      await page.waitForFunction(() => {
        const reported = document.body.textContent?.includes("Vibe reported ✓");
        return window.location.href.includes("/login?return=") || reported;
      });

      if (page.url().includes("/login?return=")) {
        await expect(page).toHaveURL(/\/login\?return=/);
        const decoded = decodeURIComponent(page.url());
        expect(decoded).toContain("/vibe-check?venueId=");
        expect(decoded).toContain("venueName=");
        return;
      }

      await expect(page.getByText("Vibe reported ✓")).toBeVisible();
    });

    await test.step("6. If submit succeeded, return home and see the venue in the feed", async () => {
      if (page.url().includes("/login?return=")) {
        test.info().annotations.push({
          type: "auth-gate",
          description: "Cold guest state redirected to /login?return=, so feed insertion is not reachable.",
        });
        return;
      }

      await page.goto("/");
      await expect(page.getByText(venueName).first()).toBeVisible();
    });
  });
});
