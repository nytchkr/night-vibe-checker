import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness, refreshBusynessForVenue } from "@/lib/besttime";
import { refreshOpenNow } from "@/lib/openNow";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

function isCronAuthorized(req: NextRequest) {
  return isAuthorizedCronRequest(req);
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
    console.error("[jobs/refresh-busyness] Refresh failed:", err);
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_BUSYNESS_FAILED", message: "Refresh busyness failed." } },
      { status: 500 }
    );
  }
}

export const GET = POST;
