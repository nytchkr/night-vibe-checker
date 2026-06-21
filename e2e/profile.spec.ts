import { expect, test } from "@playwright/test";

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

test.describe("Profile page", () => {
  test("profile shows pitch card to guest (no redirect)", async ({ page }) => {
    await page.goto("/profile");

    // Per NV-UX-CLAUDE-001: guests see pitch card, not a redirect
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText("Your Night Out HQ")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign up free/i })).toBeVisible();
  });

  test("profile shows Your Vibes section empty state for new user", async ({ page }) => {
    const authOrigin = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3000").origin;
    await page.context().addCookies([{
      name: "sb-onlpwglwnqoivuykywrk-auth-token",
      value: JSON.stringify(localSession),
      url: authOrigin,
      httpOnly: false,
      sameSite: "Lax",
    }]);

    await page.addInitScript((session) => {
      for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
        window.localStorage.setItem(key, JSON.stringify(session));
      }
    }, localSession);

    await page.route("**/api/profile/check-ins", (route) => {
      expect(route.request().headers().authorization).toBe("Bearer valid-e2e-token");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/check-ins/me", (route) => {
      expect(route.request().headers().authorization).toBe("Bearer valid-e2e-token");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: { checkIns: [] },
          meta: {
            cached: false,
            generatedAt: new Date().toISOString(),
            requestId: "nv-test-016-profile-empty",
          },
        }),
      });
    });

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

    await expect(page.getByRole("heading", { name: "Your Vibes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your first night awaits" })).toBeVisible();
  });
});
