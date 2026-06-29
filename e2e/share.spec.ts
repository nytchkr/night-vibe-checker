import { expect, test, type APIRequestContext } from "@playwright/test";

type TestVenue = {
  id: string;
  name: string;
};

async function getShareVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const venue = body?.data?.venues?.[0] as TestVenue | undefined;
  expect(venue, "expected at least one cached launch-zone venue").toBeTruthy();
  return venue!;
}

test.describe("Venue detail share", () => {
  test("shares a venue detail link through native share or clipboard fallback", async ({ page, request }) => {
    const venue = await getShareVenue(request);
    await page.addInitScript(() => {
      window.localStorage.setItem("nv_onboarded", "1");
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            window.localStorage.setItem("e2e_copied_url", value);
          },
        },
      });
    });

    await page.goto(`/venues/${venue.id}`);

    await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible();
    const shareButton = page.getByRole("button", { name: "Share venue" });
    await expect(shareButton).toBeVisible();

    await shareButton.dispatchEvent("click");

    // The fallback toast is transient; verify clipboard write instead.
    await expect(page.evaluate(() => window.localStorage.getItem("e2e_copied_url"))).resolves.toContain(
      `/venues/${venue.id}`,
    );
  });
});
