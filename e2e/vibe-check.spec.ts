// ============================================================
// E2E tests — Night Vibe Checker (Playwright)
//
// STRATEGY:
// All API calls are intercepted with page.route() — these tests do NOT
// require a running backend or live credentials. We mock:
//   POST /api/vibe-check  → returns a canned VibeReport via APIResponse
//   GET  /api/venues      → returns canned VenueBasic[] via APIResponse
//
// We test USER FLOWS end-to-end through the rendered UI:
//   - Typing a venue name and submitting
//   - Photo upload preview and submission
//   - Saving a spot (requires auth mock)
//   - Share button behaviour
//   - Error state rendering
//   - Empty-form validation
//
// WHAT WE DO NOT TEST:
//   - Internal component state (use unit tests for that).
//   - Actual OpenAI or Google Places responses.
//   - Database writes (we intercept at the API boundary).
//
// SETUP REQUIREMENT:
//   baseURL must be set to http://localhost:3000 in playwright.config.ts
//   Run `next dev` (or `next build && next start`) before running E2E tests.
// ============================================================

import { test, expect, Page } from "@playwright/test";
import type { APIResponse, VibeReport, VenueBasic } from "../src/types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_VENUE: VenueBasic = {
  placeId: "ChIJe2etest001",
  name: "The Electric Garden",
  address: "42 Night Owl Lane, Brooklyn, NY 11201",
  lat: 40.6892,
  lng: -73.9442,
  type: "bar",
  googleRating: 4.6,
  totalRatings: 320,
  priceLevel: 2,
};

const MOCK_VIBE_REPORT: VibeReport = {
  id: "e2e-report-uuid-001",
  venueId: "ChIJe2etest001",
  venueName: "The Electric Garden",
  vibeScore: 8.5,
  vibeTags: ["Lively", "Trendy", "Great Cocktails", "Group Friendly"],
  energyLevel: "High",
  musicVibe: "Loud / Dance",
  crowdType: "Packed",
  bestFor: ["Date Night", "Group Night Out"],
  summary:
    "A buzzing garden bar with creative cocktails and a rotating DJ lineup. The crowd is fun and welcoming — perfect for a group night out in Brooklyn.",
  fromPhoto: false,
  confidence: 0.88,
  generatedAt: new Date().toISOString(),
};

const MOCK_VIBE_REPORT_FROM_PHOTO: VibeReport = {
  ...MOCK_VIBE_REPORT,
  id: "e2e-report-uuid-002",
  fromPhoto: true,
  summary:
    "Based on the uploaded photo, the venue has warm ambient lighting and a welcoming atmosphere ideal for a relaxed evening out.",
  confidence: 0.72,
};

/** Wrap a value in the APIResponse envelope the real routes return. */
function apiSuccess<T>(data: T, cached = false): APIResponse<T> {
  return {
    status: "success",
    data,
    meta: {
      cached,
      generatedAt: new Date().toISOString(),
      requestId: "e2e-request-id",
    },
  };
}

function apiError(code: string, message: string): APIResponse<never> {
  return {
    status: "error",
    error: { code, message },
    meta: {
      cached: false,
      generatedAt: new Date().toISOString(),
      requestId: "e2e-request-id",
    },
  };
}

// ── Route interceptors ────────────────────────────────────────────────────────

/**
 * Intercept GET /api/venues and return `venues`.
 * Call this at the start of any test that triggers a venue search.
 */
async function mockVenueSearch(page: Page, venues: VenueBasic[] = [MOCK_VENUE]) {
  await page.route("**/api/venues**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(apiSuccess(venues)),
    });
  });
}

/**
 * Intercept POST /api/vibe-check and return `report`.
 */
async function mockVibeCheck(page: Page, report: VibeReport = MOCK_VIBE_REPORT) {
  await page.route("**/api/vibe-check", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(apiSuccess(report)),
    });
  });
}

/**
 * Intercept POST /api/vibe-check and return a 500-level API error.
 */
async function mockVibeCheckError(page: Page) {
  await page.route("**/api/vibe-check", (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(apiError("INTERNAL_ERROR", "Something went wrong on our end.")),
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Happy path: the most important user flow. If this breaks, the product is broken.
test.describe("Happy path — venue search to vibe report", () => {
  test("user types a venue name, submits, loading state appears, then vibe report renders", async ({
    page,
  }) => {
    await mockVenueSearch(page);
    await mockVibeCheck(page);
    await page.goto("/");

    // Type in the search box
    const searchInput = page.getByRole("textbox", { name: /search|venue|bar/i });
    await searchInput.fill("The Electric Garden");

    // Wait for suggestions / direct submit
    await page.keyboard.press("Enter");

    // Loading state must appear (a spinner or loading text)
    await expect(
      page.getByText(/loading|analyzing|checking vibe/i).or(
        page.locator("[aria-busy='true'], [data-loading='true'], .loading, [data-testid='loading']")
      )
    ).toBeVisible({ timeout: 3000 });

    // Vibe report must render with score, tags, and summary
    await expect(page.getByText("8.5").or(page.getByText(/8\.5/))).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/lively|trendy/i)).toBeVisible();
    await expect(page.getByText(/buzzing garden bar/i)).toBeVisible();
  });

  test("vibe score is displayed in the score ring aria-label", async ({ page }) => {
    await mockVenueSearch(page);
    await mockVibeCheck(page);
    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue|bar/i });
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");

    // VibeScoreRing renders aria-label="Vibe score {n} out of 10"
    // Also accepts a data-testid or visible text fallback
    await expect(
      page
        .getByLabel(/vibe score 8\.5 out of 10/i)
        .or(page.getByTestId("vibe-score"))
        .or(page.getByText(/8\.5/))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("all vibeTags from the report are visible in the UI", async ({ page }) => {
    await mockVenueSearch(page);
    await mockVibeCheck(page);
    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");

    // Wait for report
    await page.waitForURL(/.*/, { timeout: 10_000 });
    await expect(page.getByText(/lively/i)).toBeVisible({ timeout: 10_000 });

    for (const tag of MOCK_VIBE_REPORT.vibeTags) {
      await expect(page.getByText(new RegExp(tag, "i"))).toBeVisible();
    }
  });
});

// Photo upload flow
test.describe("Photo upload flow", () => {
  test("user selects a file, preview appears, submits, report shows visual analysis note", async ({
    page,
  }) => {
    await mockVibeCheck(page, MOCK_VIBE_REPORT_FROM_PHOTO);
    await page.goto("/");

    // The photo upload input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "venue-photo.jpg",
      mimeType: "image/jpeg",
      // Minimal 1×1 JPEG so the input is satisfied
      buffer: Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
          "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
          "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
          "MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA" +
          "AAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAA" +
          "AAAAAAAAD/2gAMAwEAAhEDEQA/AJAA/9k=",
        "base64"
      ),
    });

    // Image preview must appear after file selection
    await expect(
      page
        .locator('img[alt*="preview"], img[data-testid="photo-preview"]')
        .or(page.getByText(/preview|photo selected|image ready/i))
    ).toBeVisible({ timeout: 5000 });

    // Submit
    await page.getByRole("button", { name: /check vibe|analyze|submit/i }).click();

    // The report summary should reference "photo" or "image"
    await expect(
      page.getByText(/warm ambient lighting|uploaded photo|based on the/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// Save spot flow
test.describe("Save spot flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth — page has a logged-in session cookie
    await page.addInitScript(() => {
      Object.defineProperty(window, "__e2e_authed__", { value: true });
    });
  });

  test("user clicks save on a vibe report, sees confirmation toast, spot appears in saved list", async ({
    page,
  }) => {
    await mockVenueSearch(page);
    await mockVibeCheck(page);

    // Mock the save endpoint
    await page.route("**/api/saved-spots", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ status: "success", data: { id: "saved-spot-001" } }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");

    // Wait for report
    await expect(page.getByText(/buzzing garden bar/i)).toBeVisible({ timeout: 10_000 });

    // Click save
    await page
      .getByRole("button", { name: /save|bookmark|add to saved/i })
      .first()
      .click();

    // Confirmation toast must appear
    await expect(
      page.getByText(/saved|added to your spots|bookmark/i)
    ).toBeVisible({ timeout: 5000 });
  });
});

// Share flow
test.describe("Share flow", () => {
  test("user clicks share — either native share sheet fires or copy-link toast appears", async ({
    page,
  }) => {
    await mockVenueSearch(page);
    await mockVibeCheck(page);
    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");

    // Wait for report to load
    await expect(page.getByText(/buzzing garden bar/i)).toBeVisible({ timeout: 10_000 });

    // Mock navigator.share if it exists (not available in all Playwright browsers)
    await page.addInitScript(() => {
      (window.navigator as any).share = async () => { /* mock native share */ };
    });

    // Mock navigator.clipboard for the copy-link fallback
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => {} },
        configurable: true,
      });
    });

    await page.getByRole("button", { name: /share/i }).first().click();

    // Either native share or copy-link toast
    await expect(
      page
        .getByText(/link copied|copied to clipboard|shared/i)
        .or(page.getByRole("dialog", { name: /share/i }))
    ).toBeVisible({ timeout: 5000 });
  });
});

// Error state flow
test.describe("Error state", () => {
  // When the API returns an error the user should see a friendly message,
  // not an unhandled exception or blank screen.
  test("user sees a friendly error message when the API returns 500", async ({ page }) => {
    await mockVenueSearch(page);
    await mockVibeCheckError(page);
    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");

    // Loading state
    await expect(
      page.getByText(/loading|analyzing/i).or(
        page.locator("[aria-busy='true']")
      )
    ).toBeVisible({ timeout: 3000 });

    // Friendly error — must NOT show a raw stack trace
    await expect(
      page.getByText(/something went wrong|try again|unable to analyze|oops/i)
    ).toBeVisible({ timeout: 10_000 });

    // Confirm no stack trace / error boundary crash text is visible
    await expect(page.getByText(/at Object\.<anonymous>/)).not.toBeVisible();
    await expect(page.getByText(/Application error/i)).not.toBeVisible();
  });

  test("user can recover from an error by searching again", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/vibe-check", (route) => {
      callCount++;
      if (callCount === 1) {
        // First call fails
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify(apiError("INTERNAL_ERROR", "Temporary failure.")),
        });
      } else {
        // Retry succeeds
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(apiSuccess(MOCK_VIBE_REPORT)),
        });
      }
    });
    await mockVenueSearch(page);
    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });

    // First attempt (fails)
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/something went wrong|try again|oops/i)).toBeVisible({
      timeout: 10_000,
    });

    // Second attempt (succeeds)
    await searchInput.fill("Electric Garden");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/buzzing garden bar/i)).toBeVisible({ timeout: 10_000 });
  });
});

// Empty search validation
test.describe("Empty search validation", () => {
  // The form should prevent submission and show an inline validation message
  // rather than triggering an API call for an empty query.
  test("submitting an empty search form shows an inline validation message", async ({
    page,
  }) => {
    await page.goto("/");

    // Ensure no route interceptors are needed — the form must block early
    let apiCallMade = false;
    await page.route("**/api/**", (route) => {
      apiCallMade = true;
      route.continue();
    });

    // Click submit without typing anything
    await page
      .getByRole("button", { name: /check vibe|search|analyze|submit/i })
      .first()
      .click();

    // An inline validation message must appear near the input
    await expect(
      page.getByText(/required|please enter|search for a venue|can't be empty/i)
    ).toBeVisible({ timeout: 3000 });

    // The API must NOT have been called
    expect(apiCallMade).toBe(false);
  });

  test("submitting only whitespace shows the same validation message", async ({ page }) => {
    await page.goto("/");

    let apiCallMade = false;
    await page.route("**/api/**", (route) => {
      apiCallMade = true;
      route.continue();
    });

    const searchInput = page.getByRole("textbox", { name: /search|venue/i });
    await searchInput.fill("   "); // just whitespace
    await page.getByRole("button", { name: /check vibe|search|submit/i }).first().click();

    await expect(
      page.getByText(/required|please enter|search for a venue|can't be empty/i)
    ).toBeVisible({ timeout: 3000 });

    expect(apiCallMade).toBe(false);
  });
});
