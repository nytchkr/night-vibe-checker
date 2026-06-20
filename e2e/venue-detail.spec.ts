import { expect, test } from "@playwright/test";

test.describe("NV-TEST-001 venue detail", () => {
  test("opens the first API venue and shows live signal plus report CTA", async ({ page, request }) => {
    const venuesResponse = await request.get("/api/venues");
    expect(venuesResponse.status()).toBe(200);

    const venuesJson = await venuesResponse.json();
    const venue = venuesJson?.data?.venues?.[0];
    expect(venue?.id, "expected /api/venues to return at least one venue").toBeTruthy();
    expect(venue?.name, "expected first venue to include a name").toBeTruthy();

    const detailResponse = await request.get(`/venues/${encodeURIComponent(venue.id)}`);
    expect(detailResponse.status()).toBe(200);

    await page.goto(`/venues/${encodeURIComponent(venue.id)}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    await expect(page.getByText(/Quiet|Moderate|Packed|No data/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Sign in to )?Report the Vibe$/i })).toBeVisible();
  });
});
