import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedAdminRequest } from "@/lib/adminApiAuth";
import type { AdminVenue } from "@/types/admin";

function mapVenue(row: Record<string, unknown>): AdminVenue {
  const sig = row.venue_signals;
  const signalRow: Record<string, unknown> | undefined = Array.isArray(sig)
    ? (sig[0] as Record<string, unknown> | undefined)
    : sig != null
    ? (sig as Record<string, unknown>)
    : undefined;

  return {
    id: row.id as string,
    placeId: row.place_id as string,
    name: row.name as string,
    address: row.address as string,
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    hidden: Boolean(row.hidden),
    lastBusynessRefresh: (row.last_busyness_refresh ?? signalRow?.last_busyness_refresh ?? null) as string | null,
    busyness0To100: (signalRow?.busyness_0_100 ?? null) as number | null,
    sampleSize: Number(signalRow?.sample_size ?? 0),
  };
}

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
    .from("venues")
    .update({ hidden: body.hidden })
    .eq("id", id)
    .select(`
      id, place_id, name, address, venue_type, category, hidden, last_busyness_refresh,
      venue_signals (
        busyness_0_100, sample_size, last_busyness_refresh
      )
    `)
    .single();

  if (error || !data) {
    console.error("[admin venue PATCH] DB error:", error);
    return NextResponse.json(
      { error: "Failed to update venue" },
      { status: 500 }
    );
  }

  const venue = mapVenue(data as Record<string, unknown>);
  return NextResponse.json({ data: { venue }, venue });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorizedAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("venues")
    .update({ hidden: true })
    .eq("id", id)
    .select(`
      id, place_id, name, address, venue_type, category, hidden, last_busyness_refresh,
      venue_signals (
        busyness_0_100, sample_size, last_busyness_refresh
      )
    `)
    .single();

  if (error || !data) {
    console.error("[admin venue DELETE] DB error:", error);
    return NextResponse.json(
      { error: "Failed to hide venue" },
      { status: 500 }
    );
  }

  const venue = mapVenue(data as Record<string, unknown>);
  return NextResponse.json({ data: { venue }, venue });
}
