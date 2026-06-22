// ============================================================
// PATCH /api/admin/check-ins/[id] — toggle hidden flag
// DELETE /api/admin/check-ins/[id] — permanent delete
//
// Auth: /admin cookie must match the server-side ADMIN_PASSWORD token.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recomputeVenueSignal } from "@/lib/signals";
import { isAuthorizedAdminRequest } from "@/lib/adminApiAuth";
import type { AdminCheckIn } from "@/types/admin";

// --------------- PATCH /api/admin/check-ins/[id] -------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorizedAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { hidden: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.hidden !== "boolean") {
    return NextResponse.json(
      { error: "Body must contain { hidden: boolean }" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .update({ hidden: body.hidden })
    .eq("id", id)
    .select("id, venue_id, place_id, venue_name, busyness, crowd_feel, note, hidden, created_at, user_id")
    .single();

  if (error || !data) {
    console.error("[admin check-in PATCH] DB error:", error);
    return NextResponse.json(
      { error: "Failed to update check-in" },
      { status: 500 }
    );
  }

  // Recompute venue signal so busyness/mf_ratio immediately reflect
  // the moderated dataset (hidden rows excluded from computation).
  try {
    await recomputeVenueSignal(data.venue_id as string);
  } catch {
    // Non-fatal: log but do not fail the PATCH response
    console.error("[admin] recomputeVenueSignal failed for venue", data.venue_id);
  }

  const checkIn: AdminCheckIn = {
    id: data.id as string,
    venueId: data.venue_id as string,
    placeId: (data.place_id ?? "") as string,
    venueName: (data.venue_name ?? undefined) as string | undefined,
    busyness: data.busyness as AdminCheckIn["busyness"],
    crowdFeel: data.crowd_feel as AdminCheckIn["crowdFeel"],
    note: (data.note ?? undefined) as string | undefined,
    hidden: data.hidden as boolean,
    createdAt: data.created_at as string,
    userId: (data.user_id ?? null) as string | null,
  };

  return NextResponse.json({ data: { checkIn }, checkIn });
}

// --------------- DELETE /api/admin/check-ins/[id] ------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorizedAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch venue_id before deleting so we can recompute signal after
  const { data: existing } = await supabaseAdmin
    .from("check_ins")
    .select("venue_id")
    .eq("id", id)
    .single();

  const { error } = await supabaseAdmin
    .from("check_ins")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin check-in DELETE] DB error:", error);
    return NextResponse.json(
      { error: "Failed to delete check-in" },
      { status: 500 }
    );
  }

  // Recompute signal after deletion so venue scores stay accurate
  if (existing?.venue_id) {
    try {
      await recomputeVenueSignal(existing.venue_id as string);
    } catch {
      console.error("[admin] recomputeVenueSignal failed after delete for venue", existing.venue_id);
    }
  }

  return new NextResponse(null, { status: 204 });
}
