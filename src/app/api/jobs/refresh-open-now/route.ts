import { NextRequest, NextResponse } from "next/server";
import { refreshOpenNow } from "@/lib/openNow";

function isCronAuthorized(req: NextRequest) {
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
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const data = await refreshOpenNow();
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_OPEN_NOW_FAILED", message } },
      { status: 500 }
    );
  }
}
