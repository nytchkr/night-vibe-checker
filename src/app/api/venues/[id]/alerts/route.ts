import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return json<never>(
        { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." }, meta },
        { status: 503 },
      );
    }
    throw error;
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return json<never>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to manage venue alerts." }, meta },
      { status: 401 },
    );
  }

  const { id } = await params;
  const venueId = id.trim();
  if (!venueId) {
    return json<never>(
      { status: "error", error: { code: "VALIDATION_ERROR", message: "Venue id is required." }, meta },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("push_venue_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("venue_id", venueId);

  if (error) {
    return json<never>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not remove venue alert." }, meta },
      { status: 500 },
    );
  }

  return json({ status: "success", data: { venueId, alerting: false }, meta });
}
