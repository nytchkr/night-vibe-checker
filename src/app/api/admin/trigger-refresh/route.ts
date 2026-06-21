import { NextRequest, NextResponse } from "next/server";
import { POST as refreshOpenNow } from "@/app/api/cron/refresh-open-now/route";

const TRIGGERED = ["open-now"] as const;

type RefreshHandler = (req: NextRequest) => Response | Promise<Response>;

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function internalCronRequest(req: NextRequest, path: string, secret: string) {
  return new NextRequest(new URL(path, req.nextUrl.origin), {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });
}

async function assertRefreshSucceeded(
  name: (typeof TRIGGERED)[number],
  handler: RefreshHandler,
  req: NextRequest,
  path: string,
  secret: string
) {
  const response = await handler(internalCronRequest(req, path, secret));
  if (response.ok) return;

  let detail = "";
  try {
    detail = JSON.stringify(await response.json());
  } catch {
    detail = await response.text().catch(() => "");
  }

  throw new Error(`${name} refresh failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(req)) {
    return NextResponse.json(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Missing or invalid CRON_SECRET header." } },
      { status: 401 }
    );
  }

  try {
    await assertRefreshSucceeded("open-now", refreshOpenNow, req, "/api/cron/refresh-open-now", secret);

    return NextResponse.json({
      triggered: [...TRIGGERED],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown refresh trigger error";
    return NextResponse.json(
      { status: "error", error: { code: "TRIGGER_REFRESH_FAILED", message } },
      { status: 502 }
    );
  }
}
