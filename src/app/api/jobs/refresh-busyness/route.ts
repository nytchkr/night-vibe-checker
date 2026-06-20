import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  return (
    auth === `Bearer ${secret}` ||
    cronSecret === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 100);
  try {
    const results = await refreshBusyness(limit);
    return NextResponse.json({ status: "success", data: { results } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown refresh error";
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_BUSYNESS_FAILED", message } },
      { status: 500 }
    );
  }
}

export const GET = POST;
