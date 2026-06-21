import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness, refreshBusynessForVenue } from "@/lib/besttime";
import { refreshOpenNow } from "@/lib/openNow";

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 100);
  const venueId = req.nextUrl.searchParams.get("venueId")?.trim();

  try {
    const results = venueId ? [await refreshBusynessForVenue(venueId)] : await refreshBusyness(limit);
    const openNow = venueId ? undefined : await refreshOpenNow();
    return NextResponse.json({ status: "success", data: { results, openNow } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown refresh error";
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_BUSYNESS_FAILED", message } },
      { status: 500 }
    );
  }
}

export const GET = POST;
