// ============================================================
// GET /api/admin/check-ins — list all check-ins for moderation
//
// Auth: /admin cookie must match the server-side ADMIN_PASSWORD token.
// Returns: last 200 check-ins ordered by created_at desc,
//          including hidden=true rows (bypasses RLS via service role).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdminRequest } from "@/lib/adminApiAuth";
import type { AdminCheckIn } from "@/types/admin";

// --------------- GET /api/admin/check-ins --------------------

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, place_id, venue_name, busyness, crowd_feel, note, hidden, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch check-ins", details: error.message },
      { status: 500 }
    );
  }

  const checkIns: AdminCheckIn[] = (data ?? []).map((row) => ({
    id: row.id as string,
    venueId: row.venue_id as string,
    placeId: (row.place_id ?? "") as string,
    venueName: (row.venue_name ?? undefined) as string | undefined,
    busyness: row.busyness as AdminCheckIn["busyness"],
    crowdFeel: row.crowd_feel as AdminCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    hidden: row.hidden as boolean,
    createdAt: row.created_at as string,
    userId: (row.user_id ?? null) as string | null,
  }));

  return NextResponse.json({ checkIns });
}
