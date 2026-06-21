import { expect, test, type APIRequestContext } from "@playwright/test";

type TestVenue = {
  id: string;
  name: string;
};

async function getPublicVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.status()).toBe(200);

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as TestVenue[];
  const venue = venues[0];

  expect(venue, "expected at least one public launch-zone venue").toBeTruthy();
  expect(venue.id, "expected public venue to include an id").toBeTruthy();

  return venue;
}

test.describe("Auth protection middleware", () => {
  test("unauthenticated: /vibe-check redirects to /login", async ({ page }) => {
    await page.goto("/vibe-check");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/NightVibe|Sign in/i).first()).toBeVisible();
  });

  test("unauthenticated: /profile redirects to /login", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated: POST /api/check-ins returns 401", async ({ page }) => {
    await page.goto("/map");

    const status = await page.evaluate(async () => {
      const response = await fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: "auth-protection-venue",
          busyness: "moderate",
          crowdFeel: "mixed",
          note: "auth protection smoke",
        }),
      });

      return response.status;
    });

    expect(status).toBe(401);
  });

  test("unauthenticated: /venues/[id] is publicly accessible", async ({ page, request }) => {
    const venue = await getPublicVenue(request);
    const response = await page.goto(`/venues/${venue.id}`);

    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: venue.name })).toBeVisible();
  });

  test("unauthenticated: /map is publicly accessible", async ({ page }) => {
    const response = await page.goto("/map");

    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
