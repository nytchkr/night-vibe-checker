// ============================================================
// GET /api/check-ins/me — authenticated user's own reports
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import type { APIResponse, ConsumerCheckIn } from "@/types";

function mapCheckIn(row: Record<string, unknown>): ConsumerCheckIn {
  const venue = row.venues as { name?: unknown } | null | undefined;

  return {
    id: row.id as string,
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    venueName: venue?.name as string | undefined,
    busyness: row.busyness as ConsumerCheckIn["busyness"],
    crowdFeel: row.crowd_feel as ConsumerCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const meta = { cached: true, generatedAt: new Date().toISOString(), requestId };

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json<APIResponse<never>>(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Valid authentication token required." }, meta },
      { status: 401 }
    );
  }

  const data = await sql`
    SELECT ci.id, ci.venue_id, ci.place_id, ci.busyness, ci.crowd_feel, ci.note, ci.created_at,
           jsonb_build_object('name', v.name) AS venues,
           COUNT(*) OVER()::int AS total_count
    FROM check_ins ci
    LEFT JOIN venues v ON v.id = ci.venue_id
    WHERE ci.user_id = ${userId}
    ORDER BY ci.created_at DESC
    LIMIT 20
  `;

  const rows = data as Array<Record<string, unknown> & { total_count?: number }>;
  const checkIns = rows.map(mapCheckIn);

  return NextResponse.json<APIResponse<{ checkIns: ConsumerCheckIn[]; totalCheckIns: number }>>({
    status: "success",
    data: { checkIns, totalCheckIns: rows[0]?.total_count ?? checkIns.length },
    meta,
  });
}
