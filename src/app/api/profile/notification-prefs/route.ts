import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

const NotificationPrefsSchema = z.object({
  pushEnabled: z.boolean(),
  savedVenueBusy: z.boolean(),
  subscribedVenueAlerts: z.boolean(),
  friendCheckIns: z.boolean(),
});

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return json<never>(
        { status: "error", error: { code: "MISSING_ENV", message: error.message }, meta },
        { status: 503 },
      );
    }
    throw error;
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
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
      { status: 422 },
    );
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      { id: userId, notification_prefs: parsed.data.notificationPrefs },
      { onConflict: "id" },
    );

  if (error) {
    return json<never>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save notification preferences." }, meta },
      { status: 500 },
    );
  }

  return json({
    status: "success",
    data: { notificationPrefs: parsed.data.notificationPrefs },
    meta,
  });
}
