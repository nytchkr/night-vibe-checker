import { expect, test } from "@playwright/test";

test.describe("NV-TEST-001 admin gate", () => {
  test("redirects unauthenticated admin requests instead of rendering protected content", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });
    const body = await response.text();

    expect(response.status()).not.toBe(500);

    const location = response.headers().location ?? "";
    if (response.status() >= 300 && response.status() < 400) {
      expect(location).toContain("/admin/login");
      return;
    }

    expect(response.status()).toBe(200);
    expect(body).toContain("NEXT_REDIRECT");
    expect(body).toContain("/admin/login");
  });

  test("admin route sends guests through the password login gate", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Admin login" })).toBeVisible();
  });
});
