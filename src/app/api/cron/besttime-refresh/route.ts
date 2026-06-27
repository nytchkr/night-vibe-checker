// Azure schedules this protected GET endpoint. There is intentionally no
// Vercel cron entry for /api/cron/besttime-refresh.

import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await refreshBusyness();

  return NextResponse.json({
    status: "ok",
    queued: results.length,
  });
}
