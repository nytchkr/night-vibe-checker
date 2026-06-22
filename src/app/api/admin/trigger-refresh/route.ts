import { NextRequest, NextResponse } from "next/server";
import { POST as refreshSignals } from "@/app/api/cron/refresh-signals/route";
import { isAuthorizedAdminRequest } from "@/lib/adminApiAuth";

const TRIGGERED = ["signals"] as const;

type RefreshHandler = (req: NextRequest) => Response | Promise<Response>;

function isAuthorized(req: NextRequest) {
  return isAuthorizedAdminRequest(req);
}

function internalCronRequest(req: NextRequest, path: string, secret: string) {
  return new NextRequest(new URL(path, req.nextUrl.origin), {
    method: "POST",
    headers: {
      "x-cron-secret": secret,
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
      { status: "error", error: { code: "UNAUTHORIZED", message: "Missing or invalid admin session." } },
      { status: 401 }
    );
  }

  try {
    await assertRefreshSucceeded("signals", refreshSignals, req, "/api/cron/refresh-signals", secret);

    return NextResponse.json({
      triggered: [...TRIGGERED],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/trigger-refresh] Refresh trigger failed:", err);
    return NextResponse.json(
      { status: "error", error: { code: "TRIGGER_REFRESH_FAILED", message: "Refresh trigger failed." } },
      { status: 502 }
    );
  }
}
