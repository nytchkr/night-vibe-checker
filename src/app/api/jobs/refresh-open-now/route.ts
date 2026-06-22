import { NextRequest, NextResponse } from "next/server";
import { refreshOpenNow } from "@/lib/openNow";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

function isCronAuthorized(req: NextRequest) {
  return isAuthorizedCronRequest(req);
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  try {
    const data = await refreshOpenNow();
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    console.error("[jobs/refresh-open-now] Refresh failed:", err);
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_OPEN_NOW_FAILED", message: "Refresh open-now failed." } },
      { status: 500 }
    );
  }
}
