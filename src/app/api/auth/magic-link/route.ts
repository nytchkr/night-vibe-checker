import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitHeaders, retryAfterSeconds } from "@/lib/upstashRateLimit";
import { MissingSupabaseEnvError, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAGIC_LINK_RATE_LIMIT_MAX = 3;
const MAGIC_LINK_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

const MagicLinkBodySchema = z.object({
  email: z.string().trim().email(),
  returnTo: z.string().trim().optional(),
});

function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/map";
  return value;
}

function configError(error: unknown) {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json(
    { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." } },
    { status: 503 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = MagicLinkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Enter a valid email address." } },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const rate = await checkRateLimit(
    `auth:magic-link:${email}`,
    MAGIC_LINK_RATE_LIMIT_MAX,
    MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
  );
  const headers = rateLimitHeaders(rate);

  if (!rate.allowed) {
    return NextResponse.json(
      { status: "error", error: { code: "RATE_LIMITED", message: "Too many magic link requests. Try again later." } },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(retryAfterSeconds(rate, MAGIC_LINK_RATE_LIMIT_WINDOW_MS)),
        },
      },
    );
  }

  try {
    const origin = req.nextUrl.origin;
    const returnTo = safeReturnUrl(parsed.data.returnTo ?? req.nextUrl.searchParams.get("return"));
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? origin;
    const emailRedirectTo = `${siteOrigin}/auth/callback?return=${encodeURIComponent(returnTo)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      return NextResponse.json(
        { status: "error", error: { code: "MAGIC_LINK_FAILED", message: "Could not send the magic link." } },
        { status: 502, headers },
      );
    }

    return NextResponse.json({ status: "success", data: { ok: true } }, { status: 200, headers });
  } catch (error) {
    const response = configError(error);
    if (response) return response;
    throw error;
  }
}
