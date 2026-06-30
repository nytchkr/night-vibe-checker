import { NextResponse, type NextRequest } from "next/server";
import { apiRateLimit } from "@/lib/upstashRateLimit";

export type PublicRateLimitResult = {
  headers: Record<string, string>;
  response: NextResponse | null;
};

/** Applies the shared Upstash-backed API rate limit and returns response headers. */
export async function publicRateLimit(
  req: NextRequest | undefined,
  keyPrefix: string,
  _max = 60,
  _windowMs = 60_000,
): Promise<PublicRateLimitResult> {
  const ip =
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req?.headers.get("x-real-ip") ??
    "anonymous";
  if (!apiRateLimit) return { headers: {}, response: null };

  const rate = await apiRateLimit.limit(`${keyPrefix}:${ip}`);
  const headers = {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
  };

  if (!rate.success) {
    const retrySeconds = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
    return {
      headers,
      response: NextResponse.json(
        { status: "error", error: { code: "RATE_LIMITED", message: "Too many requests." } },
        { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } },
      ),
    };
  }

  return { headers, response: null };
}
