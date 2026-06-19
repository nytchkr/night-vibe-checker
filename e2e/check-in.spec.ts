import { expect, test } from "@playwright/test";

test.describe("Live check-in MVP flow", () => {
  test("shows the primary Check In CTA above the fold on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const cta = page.getByRole("link", { name: /check in/i }).first();
    await expect(cta).toBeVisible();

    const box = await cta.boundingBox();
    expect(box?.y ?? 9999).toBeLessThan(420);
  });

  test("submits a check-in to the API and shows confirmation", async ({ page }) => {
    let checkInPayload: Record<string, unknown> | null = null;

    await page.route("**/api/vibe-check", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { id: "background-vibe-report" },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-vibe" },
        }),
      }),
    );

    await page.route("**/api/check-ins", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      checkInPayload = payload;
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIn: {
              id: "checkin-e2e-1",
              venueId: payload.venueId,
              venueName: payload.venueName,
              crowdLevel: payload.crowdLevel,
              vibeScore: payload.vibeScore,
              musicType: payload.musicType,
              waitMinutes: payload.waitMinutes,
              tags: [],
              createdAt: new Date().toISOString(),
            },
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-checkin" },
        }),
      });
    });

    await page.goto("/vibe-check?venueId=venue-123&venueName=The%20Midnight%20Lounge");
    await expect(page.getByRole("heading", { name: "The Midnight Lounge" })).toBeVisible();

    await page.getByRole("button", { name: "Packed" }).click();
    await page.getByRole("button", { name: "Vibe score 9" }).click();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("heading", { name: "Vibe sent ✓", level: 2 })).toBeVisible();
    await expect(page.getByText("The Midnight Lounge")).toBeVisible();
    await expect(page.getByText("9")).toBeVisible();

    expect(checkInPayload).not.toBeNull();
    const payload = checkInPayload as unknown as Record<string, unknown>;
    expect(payload).toMatchObject({
      venueId: "venue-123",
      venueName: "The Midnight Lounge",
      crowdLevel: "packed",
      vibeScore: 9,
    });
    expect(typeof payload.sessionId).toBe("string");
  });

  test("shows an error state when check-in submission fails", async ({ page }) => {
    await page.route("**/api/vibe-check", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data: {}, meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-vibe" } }),
      }),
    );

    await page.route("**/api/check-ins", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          error: { code: "DB_ERROR", message: "Could not save check-in." },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-checkin-error" },
        }),
      }),
    );

    await page.goto("/vibe-check?venueId=venue-123&venueName=The%20Midnight%20Lounge");
    await page.getByRole("button", { name: "Moderate" }).click();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  });
});
