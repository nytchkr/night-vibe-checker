import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString() };

  const userId = await getAuthenticatedUserId(req);
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

  await sql`
    DELETE FROM push_venue_alerts
    WHERE user_id = ${userId}
      AND venue_id = ${venueId}
  `;

  return json({ status: "success", data: { venueId, alerting: false }, meta });
}
