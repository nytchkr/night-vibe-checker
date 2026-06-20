import { expect, test, type Page } from "@playwright/test";

const meta = {
  cached: false,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-check-ins",
};

const feedVenue = {
  id: "venue-feed-1",
  name: "Feed Test Club",
  address: "123 Test Ave",
  category: "night_club",
  photoUrl: null,
  signal: {
    venueId: "venue-feed-1",
    busyness0To100: 84,
    busynessSource: "live",
    mfRatio: 50,
    confidence0To1: 0.8,
    sampleSize: 5,
    computedAt: new Date().toISOString(),
    lastBusynessRefresh: new Date().toISOString(),
  },
};

async function mockFeed(page: Page, venues = [feedVenue]) {
  await page.route("**/api/venues**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || url.pathname !== "/api/venues") {
      return route.continue();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues },
        meta,
      }),
    });
  });
}

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

async function addLocalSession(page: Page) {
  const session = {
    access_token: "valid-e2e-token",
    refresh_token: "refresh-e2e-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
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
}

test.describe("VibeCheck consumer check-in flow", () => {
  test("routes mobile guest report CTA from the feed to login", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await markOnboarded(page);
    await mockFeed(page);

    await page.goto("/");

    await expect(page.getByText("Feed Test Club")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Feed Test Club/ }).getByText("Packed")).toBeVisible();

    const reportLink = page.getByRole("link", { name: "Sign in" }).first();
    await expect(reportLink).toBeVisible();

    const box = await reportLink.boundingBox();
    expect(box?.y ?? 9999).toBeLessThan(520);

    await reportLink.click();
    await expect(page).toHaveURL(/\/login\?return=/);
    expect(decodeURIComponent(page.url())).toContain(
      "/vibe-check?venueId=venue-feed-1&venueName=Feed+Test+Club",
    );
    await expect(page.getByRole("heading", { name: "Sign in to report" })).toBeVisible();
  });

  test("guests hitting /vibe-check are redirected to login before the form renders", async ({ page }) => {
    await page.goto("/vibe-check?venueId=venue-123&venueName=The%20Midnight%20Lounge");

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(decodeURIComponent(page.url())).toContain("/vibe-check?venueId=venue-123");
    await expect(page.getByRole("button", { name: "Report Vibe" })).toHaveCount(0);
  });

  test("submits a logged-in report to /api/check-ins with busyness and crowd feel", async ({ page }) => {
    await addLocalSession(page);

    let checkInPayload: Record<string, unknown> | null = null;
    await page.route("**/api/check-ins", async (route) => {
      if (route.request().method() !== "POST") return route.continue();

      checkInPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            checkIn: {
              id: "checkin-e2e-1",
              venueId: "venue-123",
              placeId: "place-123",
              busyness: "packed",
              crowdFeel: "mostly_male",
              note: "Line is moving",
              createdAt: new Date().toISOString(),
            },
          },
          meta,
        }),
      });
    });

    await page.goto("/vibe-check?venueId=venue-123&venueName=The%20Midnight%20Lounge");
    await page.getByRole("button", { name: "PACKED" }).click();
    await page.getByRole("button", { name: "MOSTLY GUYS" }).click();
    await expect(page.getByRole("button", { name: "PACKED" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "MOSTLY GUYS" })).toHaveAttribute("aria-pressed", "true");
    await page.getByPlaceholder("What's the vibe?").fill("Line is moving");
    const submit = page.getByRole("button", { name: "Report Vibe" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole("heading", { name: "Vibe reported" })).toBeVisible();
    expect(checkInPayload).toMatchObject({
      venueId: "venue-123",
      busyness: "packed",
      crowdFeel: "mostly_male",
      note: "Line is moving",
    });
  });

  test("shows an error state when check-in submission fails", async ({ page }) => {
    await addLocalSession(page);
    await page.route("**/api/check-ins", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          error: { code: "DB_ERROR", message: "Could not save report." },
          meta,
        }),
      }),
    );

    await page.goto("/vibe-check?venueId=venue-123&venueName=The%20Midnight%20Lounge");
    await page.getByRole("button", { name: "MODERATE" }).click();
    await page.getByRole("button", { name: "BALANCED" }).click();
    await expect(page.getByRole("button", { name: "MODERATE" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "BALANCED" })).toHaveAttribute("aria-pressed", "true");

    const submit = page.getByRole("button", { name: "Report Vibe" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("Could not save report.")).toBeVisible();
  });

  test("renders authenticated profile report history from /api/check-ins/me", async ({ page }) => {
    await addLocalSession(page);

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
                placeId: "Profile Test Club",
                busyness: "packed",
                crowdFeel: "mixed",
                note: "DJ is good",
                createdAt: new Date().toISOString(),
              },
            ],
          },
          meta,
        }),
      });
    });

    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "profile-e2e@example.com" })).toBeVisible();
    await expect(page.getByText("Your Reports")).toBeVisible();
    await expect(page.getByText("Profile Test Club")).toBeVisible();
    await expect(page.getByText("Packed")).toBeVisible();
    await expect(page.getByText("Mixed / unsure")).toBeVisible();
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
