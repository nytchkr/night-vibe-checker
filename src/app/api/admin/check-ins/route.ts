// ============================================================
// GET /api/admin/check-ins — list all check-ins for moderation
//
// Auth: Bearer token verified via supabaseAdmin.auth.getUser();
//       email must appear in ADMIN_EMAILS env var (comma-separated).
// Returns: last 200 check-ins ordered by created_at desc,
//          including hidden=true rows (bypasses RLS via service role).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { AdminCheckIn } from "@/types/admin";

// --------------- Auth helper ---------------------------------

async function verifyAdmin(req: NextRequest): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(data.user.email.toLowerCase())) return null;

  return { email: data.user.email };
}

// --------------- GET /api/admin/check-ins --------------------

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, busyness, crowd_feel, note, hidden, created_at, user_id")
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
    busyness: row.busyness as AdminCheckIn["busyness"],
    crowdFeel: row.crowd_feel as AdminCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    hidden: row.hidden as boolean,
    createdAt: row.created_at as string,
    userId: (row.user_id ?? null) as string | null,
    // placeId not returned by admin list — not needed for moderation UI
    placeId: "",
  }));

  return NextResponse.json({ checkIns });
}
