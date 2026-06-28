// QStash schedules this protected endpoint. Manual CRON_SECRET triggers remain
// available for ops smoke checks.

import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { refreshBusyness } from "@/lib/besttime";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

async function handler(): Promise<NextResponse> {
  const results = await refreshBusyness();

  return NextResponse.json({
    status: "ok",
    queued: results.length,
  });
}

function verifiedHandler() {
  return verifySignatureAppRouter(handler);
}

async function runSignedOrManual(request: NextRequest): Promise<Response> {
  if (isAuthorizedCronRequest(request)) {
    return handler();
  }

  try {
    return await verifiedHandler()(request);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "QStash signature verification is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return runSignedOrManual(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return runSignedOrManual(request);
}
