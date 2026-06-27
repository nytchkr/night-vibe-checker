import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export type PublicRateLimitResult = {
  headers: Record<string, string>;
  response: NextResponse | null;
};

/** Applies the shared in-memory API rate limit and returns response headers. */
export function publicRateLimit(
  req: NextRequest | undefined,
  keyPrefix: string,
  max = 60,
  windowMs = 60_000,
): PublicRateLimitResult {
  const ip =
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req?.headers.get("x-real-ip") ??
    "anonymous";
  const rate = checkRateLimit(`${keyPrefix}:${ip}`, max, windowMs);
  const headers = rateLimitHeaders(rate);

  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? windowMs) / 1000);
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
