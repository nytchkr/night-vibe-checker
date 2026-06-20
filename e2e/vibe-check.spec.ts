import { expect, test, type Page } from "@playwright/test";

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
      email: "vibe-check-e2e@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  // Set cookie for server-side auth gate (page.tsx reads cookies via createServerClient)
  await page.context().addCookies([{
    name: "sb-onlpwglwnqoivuykywrk-auth-token",
    value: JSON.stringify(session),
    domain: "127.0.0.1",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  }]);

  await page.addInitScript((authSession) => {
    for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
      window.localStorage.setItem(key, JSON.stringify(authSession));
    }
  }, session);
}

test.describe("Removed legacy AI vibe-check scope", () => {
  test.skip("Old /api/vibe-check, vibe scores, photo analysis, save, and share flows were removed from the consumer MVP", async () => {});
});

test.describe("Consumer report form", () => {
  test("renders the current busyness and crowd-feel controls", async ({ page }) => {
    await addLocalSession(page);
    await page.goto("/vibe-check?venueId=place-e2e&venueName=The%20Midnight%20Lounge");

    await expect(page.getByRole("heading", { name: "The Midnight Lounge" })).toBeVisible();
    await expect(page.getByText("How busy is it?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dead" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Moderate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Packed" })).toBeVisible();
    await expect(page.getByText("Crowd feel")).toBeVisible();
    await expect(page.getByRole("button", { name: /More guys/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /More girls/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mixed/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mixed/i })).toBeVisible();
  });

  test("redirects cold guests to login before enabling report submission", async ({ page }) => {
    await page.goto("/vibe-check");

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(decodeURIComponent(page.url())).toContain("/vibe-check");
    await expect(page.getByRole("button", { name: "Report Vibe" })).toHaveCount(0);
  });

  test("does not render removed AI/report-result UI", async ({ page }) => {
    await page.goto("/vibe-check");

    await expect(page.getByText(/vibe score/i)).toHaveCount(0);
    await expect(page.getByText(/upload/i)).toHaveCount(0);
    await expect(page.getByText(/save spot/i)).toHaveCount(0);
    await expect(page.getByText(/share card/i)).toHaveCount(0);
  });
});
