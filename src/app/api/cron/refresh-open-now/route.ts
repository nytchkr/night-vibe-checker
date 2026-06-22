import { NextRequest, NextResponse } from "next/server";
import { refreshOpenNow } from "@/lib/openNow";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function refreshOpenNowFromCachedHours(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await refreshOpenNow();
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    console.error("[cron/refresh-open-now] Refresh failed:", err);
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_OPEN_NOW_FAILED", message: "Refresh open-now failed." } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return refreshOpenNowFromCachedHours(req);
}

export async function POST(req: NextRequest) {
  return refreshOpenNowFromCachedHours(req);
}
