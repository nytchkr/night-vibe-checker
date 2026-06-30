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
  test("unauthenticated: /notifications redirects to /login", async ({ page }) => {
    await page.goto("/notifications");

    await expect(page).toHaveURL(/\/login\?return=%2Fnotifications/);
  });

  test("unauthenticated: /profile shows the logged-out You state", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Save your spots. Know before you go." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
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
