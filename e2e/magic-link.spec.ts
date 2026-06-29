import { expect, test, type Page } from "@playwright/test";

function isProductionBaseUrl() {
  return (process.env.BASE_URL ?? "").includes("nytchkr.com");
}

async function addLocalSession(page: Page) {
  const authOrigin = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3000").origin;
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
      email: "magic-link-e2e@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  await page.context().addCookies([{
    name: "sb-onlpwglwnqoivuykywrk-auth-token",
    value: JSON.stringify(session),
    url: authOrigin,
    httpOnly: false,
    sameSite: "Lax",
  }]);

  await page.addInitScript((authSession) => {
    for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
      window.localStorage.setItem(key, JSON.stringify(authSession));
    }
  }, session);
}

test.describe("Magic-link login flow", () => {
  test("renders the email input form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send/i })).toBeVisible();
  });

  test("shows the magic-link sent state after Supabase accepts the OTP request", async ({ page }) => {
    let redirectTo: string | null = null;

    await page.route("**/auth/v1/otp**", (route) => {
      redirectTo = new URL(route.request().url()).searchParams.get("redirect_to");

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await page.goto("/login?return=/saved");
    await page.getByLabel(/email/i).fill("magic-link-e2e@example.com");
    await page.getByRole("button", { name: /send/i }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText(/magic-link-e2e@example.com/)).toBeVisible();
    expect(redirectTo).toContain("/auth/callback?return=%2Fsaved");
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem("nightvibe.postAuthReturnUrl")))
      .toBe("/saved");
  });

  test("redirects authenticated users from login to the return URL", async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses a mocked Supabase session and is only valid against a local app server");
    await addLocalSession(page);

    await page.goto("/login?return=/profile");

    await expect(page).toHaveURL(/\/profile/);
  });

  test("uses the stored return URL when the callback return parameter is missing", async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses a mocked Supabase session and is only valid against a local app server");
    await page.goto("/");
    await page.evaluate(() => {
      window.sessionStorage.setItem("nightvibe.postAuthReturnUrl", "/saved");
    });
    await addLocalSession(page);

    await page.goto("/login?auth=callback");

    await expect(page).toHaveURL(/\/saved/);
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem("nightvibe.postAuthReturnUrl")))
      .toBeNull();
  });
});
