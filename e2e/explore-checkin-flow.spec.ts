import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type TestVenue = {
  id: string;
  slug?: string | null;
  name: string;
};

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function getFirstVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok(), `expected /api/venues to return 2xx, got ${response.status()}`).toBeTruthy();

  const body = await response.json();
  const venues = (body?.data?.venues ?? body?.venues ?? []) as TestVenue[];
  const venue = venues.find((candidate) => Boolean(candidate.id && candidate.name));
  expect(venue, "expected at least one launch-zone venue").toBeTruthy();
  if (!venue) throw new Error("expected at least one launch-zone venue");

  return venue;
}

async function getVenueDetailTarget(request: APIRequestContext): Promise<{ path: string; venue: TestVenue }> {
  const venue = await getFirstVenue(request);
  return {
    venue,
    path: `/venues/${encodeURIComponent(venue.slug || venue.id)}`,
  };
}

test.describe("NV-TEST-064 explore check-in flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await markOnboarded(page);
  });

  test("user can explore venues and navigate to venue detail", async ({ page, request }) => {
    const venue = await getFirstVenue(request);

    await page.goto("/explore", { waitUntil: "domcontentloaded" });

    const firstVenueCard = page.getByRole("link", { name: `Open ${venue.name}`, exact: true }).first();
    await expect(firstVenueCard).toBeVisible({ timeout: 20_000 });
    await firstVenueCard.click();

    await expect(page).toHaveURL(/\/venues\//);
    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
  });

  test("venue detail shows check-in button", async ({ page, request }) => {
    const target = await getVenueDetailTarget(request);

    await page.goto(target.path, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: target.venue.name })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Check in at / }).or(page.getByRole("link", { name: "Sign in to check in" })).first()).toBeVisible();
  });

  test("unauthenticated user is prompted to sign in when checking in", async ({ page, request }) => {
    const target = await getVenueDetailTarget(request);
    await page.context().clearCookies();

    await page.goto(target.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: target.venue.name })).toBeVisible({ timeout: 20_000 });

    const checkInButton = page.getByRole("button", { name: /^Check in at / }).first();
    const signInLink = page.getByRole("link", { name: "Sign in to check in" }).first();
    await expect(checkInButton.or(signInLink)).toBeVisible({ timeout: 20_000 });

    if (await checkInButton.isVisible()) {
      await checkInButton.click({ force: true });
      const confirmButton = page.getByRole("button", { name: "Confirm" }).first();
      if (await confirmButton.isVisible()) {
        await confirmButton.click({ force: true });
      }
    }

    if (await signInLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(signInLink).toHaveAttribute("href", /\/login/);
    } else {
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
