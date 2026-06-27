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

  let results: Awaited<ReturnType<typeof refreshBusyness>> = [];
  let busyError: string | null = null;
  try {
    results = await refreshBusyness();
  } catch (err) {
    busyError = errorMessage(err);
    console.error("[cron/refresh-busyness] refreshBusyness failed:", err);
  }

  let openNow: Awaited<ReturnType<typeof refreshOpenNow>> | null = null;
  let openNowError: string | null = null;
  try {
    openNow = await refreshOpenNow();
  } catch (err) {
    openNowError = errorMessage(err);
    console.error("[cron/refresh-busyness] refreshOpenNow failed:", err);
  }

  const updated = results.filter((r) => r.ok).length;
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => ({ venueId: r.venueId, error: r.reason ?? "Unknown refresh error" }));

  await logCronRun({
    jobName: "refresh-busyness",
    startedAt,
    venuesUpdated: updated,
    error: busyError ?? openNowError,
  });

  return NextResponse.json({ updated, errors, results, openNow, busyError, openNowError });
}

export const POST = GET;
