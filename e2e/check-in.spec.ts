import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const meta = {
  cached: false,
  generatedAt: new Date().toISOString(),
  requestId: "e2e-check-in-button",
};

type TestVenue = {
  id: string;
  slug?: string | null;
  placeId?: string | null;
  name: string;
  address: string;
  category?: string;
  photoUrl?: string | null;
  photoUrls?: string[];
  lat?: number;
  lng?: number;
  signal?: TestVenueSignal | null;
};

type TestVenueSignal = {
  venueId: string;
  placeId?: string | null;
  busyness0To100: number | null;
  busynessSource: "live" | "forecast" | "crowd" | "unavailable" | null;
  mfRatio: number | null;
  confidence0To1: number;
  sampleSize: number;
  computedAt: string;
  updatedAt?: string | null;
  lastBusynessRefresh: string | null;
};

const COOKIE_CHUNK_SIZE = 3180;

function isProductionBaseUrl() {
  return (process.env.BASE_URL ?? "").includes("nytchkr.com");
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function cookieChunks(name: string, value: string) {
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= COOKIE_CHUNK_SIZE) return [{ name, value }];

  const chunks: string[] = [];
  let remaining = encodedValue;
  while (remaining.length > 0) {
    let encodedChunk = remaining.slice(0, COOKIE_CHUNK_SIZE);
    const lastEscapeIndex = encodedChunk.lastIndexOf("%");
    if (lastEscapeIndex > COOKIE_CHUNK_SIZE - 3) {
      encodedChunk = encodedChunk.slice(0, lastEscapeIndex);
    }

    chunks.push(decodeURIComponent(encodedChunk));
    remaining = remaining.slice(encodedChunk.length);
  }

  return chunks.map((chunk, index) => ({ name: `${name}.${index}`, value: chunk }));
}

async function getLaunchVenue(request: APIRequestContext): Promise<TestVenue> {
  const response = await request.get("/api/venues");
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const venues = (body?.data?.venues ?? []) as TestVenue[];
  const venue = venues.find((candidate) => candidate.id && candidate.name) ?? venues[0];
  expect(venue, "expected at least one launch-zone venue").toBeTruthy();
  return venue;
}

function updatedVenue(venue: TestVenue, busyness0To100: number): TestVenue {
  const now = new Date().toISOString();
  return {
    ...venue,
    signal: {
      venueId: venue.id,
      placeId: venue.placeId ?? null,
      busyness0To100,
      busynessSource: "crowd",
      mfRatio: 0.5,
      confidence0To1: 0.82,
      sampleSize: 6,
      computedAt: now,
      updatedAt: now,
      lastBusynessRefresh: now,
    },
  };
}

async function markColdOnboarded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("nv_onboarded", "1");
    window.sessionStorage.setItem("nightvibe:desktop-warning-dismissed", "true");
  });
}

async function addLocalSession(page: Page) {
  const authOrigin = new URL(process.env.BASE_URL ?? "http://localhost:3000").origin;
  const session = {
    access_token: "valid-e2e-token",
    refresh_token: "refresh-e2e-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: "user-e2e",
      aud: "authenticated",
      role: "authenticated",
      email: "check-in-e2e@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  const sessionJson = JSON.stringify(session);
  const cookieValue = `base64-${base64Url(sessionJson)}`;
  const authCookies = ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"].flatMap((name) =>
    cookieChunks(name, cookieValue).map((cookie) => ({
      ...cookie,
      url: authOrigin,
      httpOnly: false,
      sameSite: "Lax" as const,
      secure: authOrigin.startsWith("https://"),
    })),
  );

  await page.context().addCookies(authCookies);

  await page.addInitScript((authSession) => {
    for (const key of ["sb-onlpwglwnqoivuykywrk-auth-token", "sb-gfsbqewkrcyclbktfyfk-auth-token"]) {
      window.localStorage.setItem(key, JSON.stringify(authSession));
    }
  }, session);
}

async function mockCheckInPost(
  page: Page,
  venue: TestVenue,
  options?: {
    status?: number;
    message?: string;
    pointsAwarded?: number;
    events?: string[];
  },
) {
  await page.route("**/api/check-ins", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "POST" || url.pathname !== "/api/check-ins") {
      return route.continue();
    }

    if (options?.status && options.status >= 400) {
      return route.fulfill({
        status: options.status,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          error: { code: "RATE_LIMITED", message: options.message ?? "Already checked in" },
          meta,
        }),
      });
    }

    const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    expect(payload).toMatchObject({ venue_id: venue.id });

    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: {
          checkIn: {
            id: "check-in-e2e-1",
            venueId: venue.id,
            placeId: venue.placeId ?? venue.id,
            busyness: "moderate",
            crowdFeel: null,
            note: null,
            createdAt: new Date().toISOString(),
          },
          pointsAwarded: options?.pointsAwarded ?? 10,
          events: options?.events ?? ["checkin", "first_report"],
          streakCount: 0,
        },
        meta,
      }),
    });
  });
}

async function mockVenueRefresh(page: Page, venue: TestVenue, busyness0To100: number) {
  await page.route("**/api/venues/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") return route.continue();
    if (url.pathname !== `/api/venues/${venue.id}`) return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: { venue: updatedVenue(venue, busyness0To100) },
        meta,
      }),
    });
  });
}

async function mockRecentCheckIns(page: Page, venue: TestVenue) {
  await page.route(`**/api/venues/${encodeURIComponent(venue.id)}/check-ins`, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.continue();

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: {
          checkIns: [
            {
              id: "recent-check-in-e2e-1",
              busynessLevel: 40,
              crowdFeel: null,
              gender: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        meta,
      }),
    });
  });
}

async function openVenue(page: Page, venue: TestVenue) {
  await page.goto(`/venues/${encodeURIComponent(venue.slug || venue.id)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: venue.name })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: `Check in at ${venue.name}` }).first()).toBeEnabled();
  await page.waitForTimeout(300);
}

async function confirmCheckIn(page: Page, venue: TestVenue) {
  await page.getByRole("button", { name: `Check in at ${venue.name}` }).first().click({ force: true });
  await expect(page.getByRole("dialog", { name: `Check in to ${venue.name}?` })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click({ force: true });
}

test.describe("NV-TEST-042 check-in flow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    test.skip(isProductionBaseUrl(), "uses mocked browser auth and deterministic check-in responses against the local app server");
    await page.setViewportSize({ width: 1280, height: 900 });
    await markColdOnboarded(page);
  });

  test("unauthenticated user sees login prompt when tapping check-in button", async ({ page, request }) => {
    const venue = await getLaunchVenue(request);
    await openVenue(page, venue);

    await confirmCheckIn(page, venue);

    const signInPrompt = page.getByRole("link", { name: "Sign in to check in" });
    await expect(signInPrompt).toBeVisible();
    await expect(signInPrompt).toHaveAttribute("href", /\/login\?return=/);
  });

  test("authenticated user can check in and sees success toast", async ({ page, request }) => {
    const venue = await getLaunchVenue(request);
    await addLocalSession(page);
    await mockCheckInPost(page, venue, { pointsAwarded: 10, events: ["checkin", "first_report"] });

    await openVenue(page, venue);
    await confirmCheckIn(page, venue);

    await expect(page.getByRole("status").filter({ hasText: `${venue.name}: +10 pts` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Checked in at ${venue.name}` }).first()).toBeVisible();
  });

  test("duplicate check-in within 30 minutes shows Already checked in message", async ({ page, request }) => {
    const venue = await getLaunchVenue(request);
    await addLocalSession(page);
    await mockCheckInPost(page, venue, { status: 429, message: "Already checked in" });

    await openVenue(page, venue);
    await confirmCheckIn(page, venue);

    await expect(page.getByRole("status").filter({ hasText: "Already checked in" })).toBeVisible();
  });

  test("check-in updates the busyness bar on the venue page", async ({ page, request }) => {
    const venue = await getLaunchVenue(request);
    await addLocalSession(page);
    await mockCheckInPost(page, venue, { pointsAwarded: 5, events: ["checkin"] });
    await mockVenueRefresh(page, venue, 37);
    await mockRecentCheckIns(page, venue);

    await openVenue(page, venue);
    await confirmCheckIn(page, venue);

    await expect(page.getByRole("region", { name: "Current venue signal" }).getByText("Moderate · 37%")).toBeVisible();
    await expect(page.getByRole("region", { name: "Current venue signal" }).getByText(/Early data|Based on 6 check-ins/)).toBeVisible();
  });

  test("check-in button works on mobile viewport 375px", async ({ page, request }) => {
    const venue = await getLaunchVenue(request);
    await page.setViewportSize({ width: 375, height: 812 });
    await addLocalSession(page);
    await mockCheckInPost(page, venue, { pointsAwarded: 0, events: ["checkin"] });

    await openVenue(page, venue);

    const mobileCheckIn = page.getByRole("button", { name: `Check in at ${venue.name}` }).last();
    await expect(mobileCheckIn).toBeVisible();
    const box = await mobileCheckIn.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(250);
    expect(box?.height).toBeGreaterThanOrEqual(52);

    await mobileCheckIn.click({ force: true });
    await page.getByRole("button", { name: "Confirm" }).click({ force: true });
    await expect(page.getByRole("status").filter({ hasText: `${venue.name}: Check-in recorded!` })).toBeVisible();
  });
});
