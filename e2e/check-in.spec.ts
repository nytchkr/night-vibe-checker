import { expect, test } from "@playwright/test";

test.describe("Live check-in MVP flow", () => {
  test("navigates from the live feed to a venue report form on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/check-ins?limit=20", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIns: [
              {
                id: "feed-checkin-1",
                venueId: "venue-feed-1",
                venueName: "Feed Test Club",
                crowdLevel: "packed",
                vibeScore: 8,
                tags: [],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-feed" },
        }),
      }),
    );

    await page.goto("/");

    await expect(page.getByText("Feed Test Club")).toBeVisible();
    const reportLink = page.getByRole("link", { name: /report vibe for feed test club/i });
    await expect(reportLink).toBeVisible();

    const box = await reportLink.boundingBox();
    expect(box?.y ?? 9999).toBeLessThan(420);

    await reportLink.click();
    await expect(page).toHaveURL(/\/vibe-check\?venueId=venue-feed-1/);
    await expect(page.getByRole("heading", { name: "Feed Test Club" })).toBeVisible();
  });

  test("submits a check-in to the API and shows confirmation", async ({ page }) => {
    let checkInPayload: Record<string, unknown> | null = null;

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
              sessionId: payload.sessionId,
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
    expect(payload).not.toHaveProperty("waitTime");
  });

  test("uses a safe manual venue id when no venue is prefilled", async ({ page }) => {
    let checkInPayload: Record<string, unknown> | null = null;

    await page.route("**/api/check-ins", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      checkInPayload = payload;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIn: {
              id: "checkin-manual-venue",
              venueId: payload.venueId,
              venueName: payload.venueName,
              crowdLevel: payload.crowdLevel,
              vibeScore: payload.vibeScore,
              tags: [],
              createdAt: new Date().toISOString(),
            },
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-manual-venue" },
        }),
      });
    });

    await page.goto("/vibe-check");
    await page.getByLabel(/venue name/i).fill("The Neon Lounge");
    await page.getByRole("button", { name: "Packed" }).click();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("heading", { name: "Vibe sent ✓", level: 2 })).toBeVisible();
    expect(checkInPayload).toMatchObject({
      venueId: "manual:the-neon-lounge",
      venueName: "The Neon Lounge",
      crowdLevel: "packed",
    });
  });

  test("returns to the feed with the submitted check-in visible", async ({ page }) => {
    const submittedAt = new Date().toISOString();
    let savedCheckIn: Record<string, unknown> | null = null;

    await page.route("**/api/check-ins?limit=20", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIns: savedCheckIn
              ? [
                  {
                    id: "checkin-feed-return",
                    venueId: savedCheckIn.venueId,
                    venueName: savedCheckIn.venueName,
                    crowdLevel: savedCheckIn.crowdLevel,
                    vibeScore: savedCheckIn.vibeScore,
                    tags: [],
                    createdAt: submittedAt,
                  },
                ]
              : [],
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-return-feed" },
        }),
      }),
    );

    await page.route("**/api/check-ins", async (route) => {
      savedCheckIn = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIn: {
              id: "checkin-feed-return",
              ...savedCheckIn,
              tags: [],
              createdAt: submittedAt,
            },
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-checkin-return" },
        }),
      });
    });

    await page.goto("/vibe-check?venueId=venue-return&venueName=After%20Hours");
    await page.getByRole("button", { name: "Wild" }).click();
    await page.getByRole("button", { name: "Vibe score 8" }).click();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByRole("heading", { name: "Vibe sent ✓", level: 2 })).toBeVisible();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("After Hours")).toBeVisible();
    await expect(page.getByText("WILD")).toBeVisible();
    await expect(page.getByText("8")).toBeVisible();
  });

  test("shows an error state when check-in submission fails", async ({ page }) => {
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

    await expect(page.getByText("Couldn't submit — tap to retry")).toBeVisible();
  });

  test("renders authenticated profile check-in history from /api/check-ins/me", async ({ page }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const session = {
      access_token: "valid-e2e-token",
      refresh_token: "refresh-e2e-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: expiresAt,
      user: {
        id: "user-e2e",
        aud: "authenticated",
        role: "authenticated",
        email: "profile-e2e@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };

    await page.addInitScript((authSession) => {
      for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
        window.localStorage.setItem(key, JSON.stringify(authSession));
      }
    }, session);

    await page.route("**/api/check-ins/me", (route) => {
      expect(route.request().headers().authorization).toBe("Bearer valid-e2e-token");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIns: [
              {
                id: "profile-checkin-1",
                venueId: "venue-profile-1",
                venueName: "Profile Test Club",
                crowdLevel: "wild",
                vibeScore: 10,
                tags: [],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          meta: { cached: false, generatedAt: new Date().toISOString(), requestId: "e2e-profile" },
        }),
      });
    });

    await page.goto("/profile");

    await expect(page.getByText("profile-e2e@example.com")).toBeVisible();
    await expect(page.getByText("Profile Test Club")).toBeVisible();
    await expect(page.getByText(/wild/i)).toBeVisible();
    await expect(page.getByText("10")).toBeVisible();
  });

  test("protects /api/check-ins/me when unauthenticated", async ({ request }) => {
    const res = await request.get("/api/check-ins/me");
    expect(res.status()).toBe(401);

    const json = await res.json();
    expect(json).toMatchObject({
      status: "error",
      error: { code: "UNAUTHORIZED" },
    });
  });
});
