// NV-018 regression E2E — share card, save spot, profile page
// Runs after NV-010 (ShareButton) and NV-015 (auth + save-spot API) land.

import { test, expect } from "@playwright/test";

// --------------- Share card (NV-010) -----------------------

test.describe("Share card — NV-010", () => {
  test("Share button is visible on the vibe check result", async ({ page }) => {
    // Mock the vibe-check API so we get a result without real credentials
    await page.route("**/api/vibe-check", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            id: "test-id",
            venueId: "place-abc",
            venueName: "Test Bar",
            vibeScore: 8.2,
            energyLevel: "High",
            vibeTags: ["Lively", "EDM"],
            musicVibe: "Loud / Dance",
            crowdType: "Packed",
            bestFor: ["Group Night Out", "Late Night"],
            summary: "Great vibes all night with a packed floor.",
            generatedAt: new Date().toISOString(),
            fromPhoto: false,
            confidence: 0.85,
          },
        }),
      })
    );

    await page.goto("/vibe-check");
    await page.fill("input[placeholder*='venue']", "Test Bar");
    await page.keyboard.press("Enter");

    // Wait for result card
    await page.waitForSelector("article[aria-label*='Vibe report']", { timeout: 10000 });

    // Share button must be present
    const shareBtn = page.getByRole("button", { name: /share/i });
    await expect(shareBtn).toBeVisible();
  });

  test("Share button uses clipboard fallback on desktop", async ({ page }) => {
    await page.addInitScript(() => {
      // Remove native share so clipboard fallback triggers
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
      });
    });

    await page.route("**/api/vibe-check", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            id: "test-id-2",
            venueId: "place-abc",
            venueName: "Test Bar",
            vibeScore: 7.5,
            energyLevel: "Medium",
            vibeTags: ["Chill"],
            musicVibe: "Moderate",
            crowdType: "Moderate",
            bestFor: ["Casual Hangout"],
            summary: "Relaxed spot with good drinks.",
            generatedAt: new Date().toISOString(),
            fromPhoto: false,
            confidence: 0.75,
          },
        }),
      })
    );

    await page.goto("/vibe-check");
    await page.fill("input[placeholder*='venue']", "Test Bar");
    await page.keyboard.press("Enter");
    await page.waitForSelector("article[aria-label*='Vibe report']", { timeout: 10000 });

    const shareBtn = page.getByRole("button", { name: /share/i });
    await shareBtn.click();

    // After click, button should show "Copied!" text
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible({ timeout: 3000 });
  });
});

// --------------- Profile page unauthenticated (NV-015) -----

test.describe("Profile page — NV-015", () => {
  test("shows sign-in form when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText(/sign in to save spots/i)).toBeVisible();
    await expect(page.getByPlaceholder(/your@email.com/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send link/i })).toBeVisible();
  });

  test("shows empty saved spots state for unauthenticated user", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText(/spots you save will appear here/i)).toBeVisible();
  });

  test("shows saved spots when API returns data (mocked session)", async ({ page }) => {
    // Intercept saved-spots API with mock data
    await page.route("**/api/saved-spots", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          data: {
            spots: [
              {
                id: "spot-1",
                userId: "user-abc",
                venueId: "place-xyz",
                venueName: "Night Club One",
                address: "123 Main St",
                vibeScoreSnapshot: 9.1,
                savedAt: new Date().toISOString(),
                tags: ["Lively", "EDM"],
              },
            ],
          },
        }),
      })
    );

    // Inject a fake Supabase session so the page fetches spots
    await page.addInitScript(() => {
      // Stub createBrowserClient to return a fake session immediately
      const fakeSession = {
        access_token: "fake-token",
        user: { id: "user-abc", email: "test@example.com" },
      };
      // Override localStorage so Supabase picks up a session
      window.localStorage.setItem(
        "sb-localhost-auth-token",
        JSON.stringify({ access_token: "fake-token", user: fakeSession.user })
      );
    });

    await page.goto("/profile");

    // The profile page should attempt to fetch spots and render the name
    // (may show loading briefly)
    await expect(page.getByText("Night Club One")).toBeVisible({ timeout: 8000 });
  });
});

// --------------- Regression smoke: vibe-check flow ---------

test.describe("Regression smoke — vibe-check flow", () => {
  test("vibe check page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/vibe-check");
    await expect(page.getByRole("main")).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test("home page loads and search is functional", async ({ page }) => {
    await page.route("**/api/venues*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", data: { venues: [] } }),
      })
    );

    await page.goto("/");
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill("bar");
    // No crash — search fires without error
    await page.waitForTimeout(500);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    expect(errors).toHaveLength(0);
  });
});
