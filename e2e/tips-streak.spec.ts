import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Venue = {
  id: string;
  name?: string;
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    [key: string]: unknown;
  };
};

const COOKIE_CHUNK_SIZE = 3180;

function getSupabaseAuthEnv() {
  return {
    email: process.env.PLAYWRIGHT_USER_EMAIL,
    password: process.env.PLAYWRIGHT_USER_PASSWORD,
    supabaseUrl: process.env.PLAYWRIGHT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.PLAYWRIGHT_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

async function getFirstVenue(page: Page): Promise<Venue> {
  const response = await page.request.get("/api/venues");
  expect(response.ok(), `expected /api/venues to return 2xx, got ${response.status()}`).toBeTruthy();

  const body = await response.json();
  const venues = (Array.isArray(body) ? body : body?.data?.venues ?? body?.venues ?? []) as Venue[];
  const venue = venues.find((candidate) => Boolean(candidate.id));
  expect(venue, "expected at least one venue from /api/venues").toBeTruthy();
  if (!venue) throw new Error("expected at least one venue from /api/venues");

  return venue;
}

function readTipsArray(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const data = (body as { data?: { tips?: unknown } }).data;
    if (Array.isArray(data?.tips)) return data.tips;
  }
  return null;
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

async function signInWithSupabasePassword(page: Page, context: BrowserContext): Promise<void> {
  const { email, password, supabaseUrl, supabaseAnonKey } = getSupabaseAuthEnv();

  test.skip(!email || !password, "PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD are required for profile streak auth coverage.");
  test.skip(!supabaseUrl || !supabaseAnonKey, "Supabase URL and anon key are required for password auth setup.");

  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    data: {
      email,
      password,
    },
  });

  expect(response.ok(), `expected Supabase password sign-in to succeed, got ${response.status()}`).toBeTruthy();
  const session = (await response.json()) as SupabaseSession;
  expect(session.access_token, "expected Supabase sign-in to return an access token").toBeTruthy();

  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionJson = JSON.stringify(session);
  const appOrigin = new URL(process.env.BASE_URL ?? "http://localhost:3000").origin;

  await context.addCookies(
    cookieChunks(storageKey, `base64-${base64Url(sessionJson)}`).map((cookie) => ({
      ...cookie,
      url: appOrigin,
      sameSite: "Lax" as const,
      httpOnly: false,
      secure: appOrigin.startsWith("https://"),
    })),
  );

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: storageKey, value: sessionJson },
  );
}

test.describe("NV-TEST-026 tips and streak", () => {
  test("venue tips API returns 200", async ({ page }) => {
    const venue = await getFirstVenue(page);

    const response = await page.request.get(`/api/venues/${encodeURIComponent(venue.id)}/tips`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(readTipsArray(body), "expected tips response body or data.tips to be an array").toEqual(expect.any(Array));
  });

  test("venue detail page shows tips section", async ({ page }) => {
    const venue = await getFirstVenue(page);

    await page.goto(`/venues/${encodeURIComponent(venue.id)}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/Tips from locals|Be the first/i).first()).toBeVisible();
  });

  test("profile streak section visible when logged in", async ({ page, context }) => {
    await signInWithSupabasePassword(page, context);

    await page.goto("/profile", { waitUntil: "domcontentloaded" });

    await expect(page.getByText(/streak|Check in/i).first()).toBeVisible();
  });

  test("tips API rejects unauthenticated POST", async ({ page }) => {
    await page.context().clearCookies();
    const venue = await getFirstVenue(page);

    const response = await page.request.post(`/api/venues/${encodeURIComponent(venue.id)}/tips`, {
      data: { tip: "test tip text here!" },
    });

    expect(response.status()).toBe(401);
  });
});
