import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import { errorMessage, logCronRun } from "@/lib/cronHealth";
import { refreshOpenNow } from "@/lib/openNow";

export const dynamic = "force-dynamic";

async function refreshSignals(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
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
    await logCronRun({ jobName: "refresh-signals", startedAt, venuesUpdated: updated });

    return NextResponse.json({ updated, errors, results, openNow });
  } catch (err) {
    await logCronRun({ jobName: "refresh-signals", startedAt, error: errorMessage(err) });
    console.error("[cron/refresh-signals] Refresh failed:", err);
    return NextResponse.json({ error: "Refresh signals failed." }, { status: 500 });
  }
}

export const GET = refreshSignals;
export const POST = refreshSignals;
