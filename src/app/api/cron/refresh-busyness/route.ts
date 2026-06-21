// Required server env vars: CRON_SECRET, BESTTIME_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";
import { refreshOpenNow } from "@/lib/openNow";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await refreshBusyness(100);
    const openNow = await refreshOpenNow();
    const errors = results
      .filter((result) => !result.ok)
      .map((result) => ({
        venueId: result.venueId,
        error: result.reason ?? "Unknown refresh error",
      }));

    return NextResponse.json({
      updated: results.filter((result) => result.ok).length,
      errors,
      results,
      openNow,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown refresh error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
