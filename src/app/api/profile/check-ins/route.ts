// ============================================================
// GET /api/profile/check-ins — signed-in user's recent vibes
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProfileCheckInRow = {
  id: string;
  venue_id: string;
  venue_name: string | null;
  busyness: string | null;
  crowd_feel: string | null;
  note: string | null;
  created_at: string;
};

type CheckInRecord = {
  id: string;
  venue_id: string | null;
  busyness: string | null;
  crowd_feel: string | null;
  note: string | null;
  created_at: string;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

function venueNameFrom(row: CheckInRecord): string | null {
  const venues = row.venues;
  if (Array.isArray(venues)) return venues[0]?.name ?? null;
  return venues?.name ?? null;
}

function mapRow(row: CheckInRecord): ProfileCheckInRow {
  return {
    id: row.id,
    venue_id: row.venue_id ?? "",
    venue_name: venueNameFrom(row),
    busyness: row.busyness,
    crowd_feel: row.crowd_feel,
    note: row.note,
    created_at: row.created_at,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<ProfileCheckInRow[]>> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json([]);

  const data = await sql`
    SELECT ci.id, ci.venue_id, ci.busyness, ci.crowd_feel, ci.note, ci.created_at,
           jsonb_build_object('name', v.name) AS venues
    FROM check_ins ci
    LEFT JOIN venues v ON v.id = ci.venue_id
    WHERE ci.user_id = ${userId}
      AND ci.hidden = false
    ORDER BY ci.created_at DESC
  `;

  return NextResponse.json((data as CheckInRecord[]).map(mapRow));
}
