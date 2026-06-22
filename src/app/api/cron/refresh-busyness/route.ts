// Required server env vars: CRON_SECRET, BESTTIME_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";
import { errorMessage, logCronRun } from "@/lib/cronHealth";
import { refreshOpenNow } from "@/lib/openNow";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    Boolean(secret) &&
    (req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret)
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const results = await refreshBusyness(50);
    const openNow = await refreshOpenNow();
    const updated = results.filter((result) => result.ok).length;
    const errors = results
      .filter((result) => !result.ok)
      .map((result) => ({
        venueId: result.venueId,
        error: result.reason ?? "Unknown refresh error",
      }));
    await logCronRun({ jobName: "refresh-busyness", startedAt, venuesUpdated: updated });

    return NextResponse.json({
      updated,
      errors,
      results,
      openNow,
    });
  } catch (err) {
    await logCronRun({ jobName: "refresh-busyness", startedAt, error: errorMessage(err) });
    console.error("[cron/refresh-busyness] Refresh failed:", err);
    return NextResponse.json({ error: "Refresh busyness failed." }, { status: 500 });
  }
}

export const POST = GET;
