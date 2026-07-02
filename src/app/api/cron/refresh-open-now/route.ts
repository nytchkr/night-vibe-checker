import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { errorMessage, logCronRun } from "@/lib/cronHealth";
import { refreshOpenNow } from "@/lib/openNow";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

async function handler(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    const data = await refreshOpenNow();
    await logCronRun({ jobName: "refresh-open-now", startedAt, venuesUpdated: data.updated });
    return NextResponse.json({ status: "success", data });
  } catch (err) {
    await logCronRun({ jobName: "refresh-open-now", startedAt, error: errorMessage(err) });
    console.error("[cron/refresh-open-now] Refresh failed:", err);
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_OPEN_NOW_FAILED", message: "Refresh open-now failed." } },
      { status: 500 }
    );
  }
}

function verifiedHandler() {
  return verifySignatureAppRouter(handler);
}

async function runSignedOrManual(req: NextRequest): Promise<Response> {
  if (isAuthorizedCronRequest(req)) return handler();
  try {
    return await verifiedHandler()(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  return runSignedOrManual(req);
}

export async function POST(req: NextRequest) {
  return runSignedOrManual(req);
}
