import { expect, test, type Page } from "@playwright/test";

const localSession = {
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

async function addLocalSession(page: Page) {
  const authOrigin = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3000").origin;
  for (const name of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
    await page.context().addCookies([{
      name,
      value: JSON.stringify(localSession),
      url: authOrigin,
      httpOnly: false,
      sameSite: "Lax",
    }]);
  }

  await page.addInitScript((session) => {
    if (window.sessionStorage.getItem("nightvibe.e2e.disableAuthRestore") === "1") return;
    for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
      window.localStorage.setItem(key, JSON.stringify(session));
    }
  }, localSession);
}

test.describe("Profile page", () => {
  test("You tab shows logged-out state for guests", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "You" })).toBeVisible();
    await expect(page.getByText("Sign in to see your profile")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("profile shows empty state for new user", async ({ page }) => {
    test.skip(
      (process.env.BASE_URL ?? "").includes("night-vibe-checker.vercel.app"),
      "uses a mocked Supabase session and is only valid against a local app server",
    );
    await addLocalSession(page);

    await page.route("**/api/profile/check-ins", (route) => {
      expect(route.request().headers().authorization).toBe("Bearer valid-e2e-token");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/profile/streak", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 }),
    }));
    await page.route("**/api/profile/gender", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gender: null }),
    }));

    await page.route("**/api/saved-venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { savedVenueIds: [] },
        meta: {
          cached: false,
          generatedAt: new Date().toISOString(),
          requestId: "nv-test-015-saved-empty",
        },
      }),
    }));

    await page.route("**/api/venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [] },
        meta: {
          cached: false,
          generatedAt: new Date().toISOString(),
          requestId: "nv-test-015-venues-empty",
        },
      }),
    }));

    await page.goto("/profile");

    await expect(page.getByRole("region", { name: "Check-in History" })).toContainText("No check-ins yet");
    await expect(page.getByRole("link", { name: "Find venues on the map" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved venues" })).toContainText("No saved spots yet");
    await expect(page.getByRole("link", { name: "Browse South End venues" })).toBeVisible();
  });

  test("profile renders recent check-ins with busyness and notes", async ({ page }) => {
    test.skip(
      (process.env.BASE_URL ?? "").includes("night-vibe-checker.vercel.app"),
      "uses a mocked Supabase session and is only valid against a local app server",
    );
    await addLocalSession(page);

    await page.route("**/api/profile/check-ins", (route) => {
      expect(route.request().headers().authorization).toBe("Bearer valid-e2e-token");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "check-in-1",
            venue_id: "venue-1",
            venue_name: "Trio",
            busyness: "packed",
            note: "Line is moving",
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/profile/streak", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentStreak: 1, longestStreak: 1, totalCheckIns: 1 }),
    }));
    await page.route("**/api/saved-venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "success", data: { savedVenueIds: [] } }),
    }));
    await page.route("**/api/venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "success", data: { venues: [] } }),
    }));
    await page.route("**/api/profile/gender", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gender: null }),
    }));

    await page.goto("/profile");

    const history = page.getByRole("region", { name: "Check-in History" });
    await expect(history).toContainText("Trio");
    await expect(history).toContainText("2h ago");
    await expect(history).toContainText("Packed");
    await expect(history).toContainText("Line is moving");
  });

  test("sign out clears the session and protects authenticated-only routes", async ({ page }) => {
    test.skip(
      (process.env.BASE_URL ?? "").includes("night-vibe-checker.vercel.app"),
      "uses a mocked Supabase session and is only valid against a local app server",
    );
    await addLocalSession(page);

    await page.route("**/api/profile/check-ins", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }));
    await page.route("**/api/profile/streak", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 }),
    }));
    await page.route("**/api/saved-venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { savedVenueIds: [] },
        meta: {
          cached: false,
          generatedAt: new Date().toISOString(),
          requestId: "nv-signout-saved",
        },
      }),
    }));
    await page.route("**/api/venues", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venues: [] },
        meta: {
          cached: false,
          generatedAt: new Date().toISOString(),
          requestId: "nv-signout-venues",
        },
      }),
    }));
    await page.route("**/api/profile/gender", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ gender: null }),
    }));
    await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204, body: "" }));

    await page.goto("/profile");
    await expect(page.getByText("profile-e2e@example.com")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const storageSessions = await page.evaluate(() =>
      ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]
        .map((key) => window.localStorage.getItem(key))
        .filter(Boolean),
    );
    expect(storageSessions).toEqual([]);

    const authCookies = (await page.context().cookies())
      .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));
    expect(authCookies).toEqual([]);

    await page.evaluate(() => {
      window.sessionStorage.setItem("nightvibe.e2e.disableAuthRestore", "1");
    });

    await page.goto("/profile");
    await expect(page.getByText("Sign in to see your profile")).toBeVisible();

    await page.goto("/vibe-check");
    await expect(page).toHaveURL(/\/login\?return=%2Fvibe-check/);

    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/login\?return=%2Fnotifications/);
  });
});
