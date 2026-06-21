import { expect, test } from "@playwright/test";

test.describe("NV-TEST-001 admin gate", () => {
  test("redirects unauthenticated admin requests instead of rendering protected content", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });
    const body = await response.text();

    expect(response.status()).not.toBe(500);

    const location = response.headers().location ?? "";
    if (response.status() >= 300 && response.status() < 400) {
      expect(location).toContain("/login");
      expect(decodeURIComponent(location)).toContain("/admin");
      return;
    }

    expect(response.status()).toBe(200);
    expect(body).toContain("NEXT_REDIRECT");
    expect(body).toContain("/login?return=%2Fadmin");
  });

  test("admin route sends guests through the login gate with admin return context", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(new URL(page.url()).searchParams.get("return")).toBe("/admin");
    await expect(page.getByRole("heading", { name: "NightVibe" })).toBeVisible();
  });
});
