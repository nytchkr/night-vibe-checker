// Required server env vars: CRON_SECRET, BESTTIME_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness } from "@/lib/besttime";
import { errorMessage, logCronRun } from "@/lib/cronHealth";
import { LAUNCH_ZONES, type LaunchZone } from "@/lib/launchZone";

export const dynamic = "force-dynamic";

const MAX_VENUES_PER_ZONE_CALL = 30;
const ZONE_IDS = new Set<string>(LAUNCH_ZONES.map((zone) => zone.id));

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    Boolean(secret) &&
    (req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret)
  );
}

function readZoneId(req: NextRequest): LaunchZone["id"] | null {
  const zone = req.nextUrl.searchParams.get("zone");
  return zone && ZONE_IDS.has(zone) ? (zone as LaunchZone["id"]) : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const zone = readZoneId(req);
  if (!zone) {
    return NextResponse.json(
      {
        error: "Invalid zone",
        allowedZones: LAUNCH_ZONES.map((launchZone) => launchZone.id),
      },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  let results: Awaited<ReturnType<typeof refreshBusyness>> = [];
  let busyError: string | null = null;
  try {
    results = await refreshBusyness(MAX_VENUES_PER_ZONE_CALL, zone);
  } catch (err) {
    busyError = errorMessage(err);
    console.error(`[cron/refresh-busyness-zone] refreshBusyness failed for ${zone}:`, err);
  }

  const updated = results.filter((r) => r.ok).length;
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => ({ venueId: r.venueId, error: r.reason ?? "Unknown refresh error" }));

  await logCronRun({
    jobName: `refresh-busyness-zone:${zone}`,
    startedAt,
    venuesUpdated: updated,
    error: busyError,
  });

  return NextResponse.json({
    zone,
    limit: MAX_VENUES_PER_ZONE_CALL,
    updated,
    errors,
    results,
    busyError,
  });
}

export const POST = GET;
