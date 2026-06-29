import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Venue = {
  id: string;
  name: string;
};

async function getFirstVenue(request: APIRequestContext): Promise<Venue> {
  const response = await request.get("/api/venues");
  expect(response.ok(), `expected /api/venues to return 2xx, got ${response.status()}`).toBeTruthy();

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as Venue[];
  const venue = venues.find((candidate) => Boolean(candidate.id));
  expect(venue, "expected at least one venue from /api/venues").toBeTruthy();
  if (!venue) throw new Error("expected at least one venue from /api/venues");

  return venue as Venue;
}

async function markOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("nv_onboarded", "1");
  });
}

test.describe("NV-TEST-025 social features", () => {
  test("leaderboard page loads", async ({ page }) => {
    const response = await page.goto("/leaderboard", { waitUntil: "domcontentloaded" });

    expect(response?.status(), "expected /leaderboard to return a non-error status").toBeLessThan(400);
    await expect(page.getByText("Most Active")).toBeVisible();
    await expect(page.getByRole("listitem").first().or(page.getByText(/Leaderboard is unavailable/i))).toBeVisible();
  });

  test("venue tips section visible on venue detail", async ({ page, request }) => {
    const venue = await getFirstVenue(request);

    await page.goto(`/venues/${venue.id}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    await expect(page.getByRole("region", { name: "Tips from locals" })).toBeVisible();
  });

  test("leaderboard public - no auth required", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/leaderboard", { waitUntil: "domcontentloaded" });

    expect(response?.status(), "expected public leaderboard to return a non-error status").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Most Active")).toBeVisible();
    await expect(page.getByText(/404|500|Application error|Something went wrong/i)).toHaveCount(0);
  });

  test("widget page loads for a venue", async ({ page, request }) => {
    const venue = await getFirstVenue(request);

    const response = await page.goto(`/widget/${venue.id}`, { waitUntil: "domcontentloaded" });

    expect(response?.status(), "expected venue widget to return a non-error status").toBeLessThan(400);
    await expect(page.getByText(/nytchkr|Busyness|Packed|Moderate|Quiet|No data/i).first()).toBeVisible();
  });

  test("search suggestions appear on map", async ({ page, request }) => {
    const venue = await getFirstVenue(request);
    await markOnboarded(page);

    await page.goto("/map", { waitUntil: "domcontentloaded" });

    const searchInput = page.getByTestId("venue-search").or(page.getByPlaceholder(/Search/i)).or(page.getByRole("searchbox", { name: /Search/i }));
    await expect(searchInput.first()).toBeVisible({ timeout: 25000 });

    await searchInput.first().fill(venue.name.slice(0, 3));
    await expect(page.getByRole("listbox", { name: /Venue suggestions/i })).toBeVisible();
  });
});
