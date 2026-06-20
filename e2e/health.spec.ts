import { expect, test } from "@playwright/test";

test.describe("NV-TEST-004 health endpoint", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    await expect(response).toBeOK();

    const json = await response.json();
    expect(json.status).toBe("ok");
  });

  test("GET /api/health reports at least one venue from the real local server", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.venue_count).toBeGreaterThan(0);
  });
});
