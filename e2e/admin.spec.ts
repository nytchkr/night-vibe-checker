import { expect, test } from "@playwright/test";

test.describe("NV-TEST-001 admin gate", () => {
  test("redirects unauthenticated admin requests instead of rendering protected content", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.status()).not.toBe(500);
    expect(response.status()).not.toBe(200);

    const location = response.headers().location ?? "";
    expect(location).toContain("/login");
    expect(decodeURIComponent(location)).toContain("/admin");
  });

  test("admin route sends guests through the login gate with admin return context", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login\?return=/);
    expect(new URL(page.url()).searchParams.get("return")).toBe("/admin");
    await expect(page.getByRole("heading", { name: "Sign in to report" })).toBeVisible();
  });
});
