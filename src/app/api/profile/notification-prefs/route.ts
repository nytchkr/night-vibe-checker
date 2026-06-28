import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

const NotificationPrefsSchema = z.object({
  notifyBusyVenues: z.boolean(),
  notifyWeeklySummary: z.boolean(),
});

const DEFAULT_NOTIFICATION_PREFS = {
  notifyBusyVenues: false,
  notifyWeeklySummary: false,
} as const;

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return json<never>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to save notification preferences." }, meta },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json<never>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
      { status: 400 },
    );
  }

  const parsed = z.object({ notificationPrefs: NotificationPrefsSchema }).safeParse(body);
  if (!parsed.success) {
    return json<never>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "notificationPrefs is invalid." }, meta },
      { status: 400 },
    );
  }

  await sql`
    INSERT INTO user_preferences (user_id, notify_busy_venues, notify_weekly_summary, updated_at)
    VALUES (
      ${userId},
      ${parsed.data.notificationPrefs.notifyBusyVenues},
      ${parsed.data.notificationPrefs.notifyWeeklySummary},
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      notify_busy_venues = EXCLUDED.notify_busy_venues,
      notify_weekly_summary = EXCLUDED.notify_weekly_summary,
      updated_at = now()
  `;

  return json({
    status: "success",
    data: { notificationPrefs: parsed.data.notificationPrefs },
    meta,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return json<never>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to read notification preferences." }, meta },
      { status: 401, headers: { "Cache-Control": "private, no-cache" } },
    );
  }

  const rows = (await sql`
    SELECT notify_busy_venues, notify_weekly_summary
    FROM user_preferences
    WHERE user_id = ${userId}
    LIMIT 1
  `) as Array<{ notify_busy_venues?: unknown; notify_weekly_summary?: unknown }>;

  const row = rows[0] ?? null;
  const notificationPrefs = {
    notifyBusyVenues:
      typeof row?.notify_busy_venues === "boolean" ? row.notify_busy_venues : DEFAULT_NOTIFICATION_PREFS.notifyBusyVenues,
    notifyWeeklySummary:
      typeof row?.notify_weekly_summary === "boolean" ? row.notify_weekly_summary : DEFAULT_NOTIFICATION_PREFS.notifyWeeklySummary,
  };

  return json(
    { status: "success", data: { notificationPrefs }, meta },
    { headers: { "Cache-Control": "private, no-cache" } },
  );
}
