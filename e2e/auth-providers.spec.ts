import { expect, test } from "@playwright/test";

// Guards that OAuth providers are actually enabled in Supabase.
// Tests the real /authorize endpoint — not the client-side URL builder which succeeds
// even when the provider is disabled (signInWithOAuth skipBrowserRedirect: true is a false positive).
// Run as a named smoke: npx playwright test e2e/auth-providers.spec.ts
test.describe("Auth provider smoke", () => {
  test("Google OAuth provider is enabled in Supabase", async ({ request }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://onlpwglwnqoivuykywrk.supabase.co";
    if (!supabaseUrl) test.skip(true, "NEXT_PUBLIC_SUPABASE_URL not set");

    const callbackUrl = encodeURIComponent(
      `${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/auth/callback`
    );
    const authorizeUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${callbackUrl}`;

    // Must return 302 → Google. 400 means provider is not enabled in Supabase dashboard.
    const response = await request.get(authorizeUrl, { maxRedirects: 0 });
    expect(
      response.status(),
      `Google OAuth returned HTTP ${response.status()} — expected 302. ` +
        `If 400: go to Supabase Dashboard → Authentication → Providers → Google and enable it.`
    ).toBe(302);
  });
});
