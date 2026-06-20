import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { AdminVenue } from "@/types/admin";

async function verifyAdmin(req: NextRequest): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(data.user.email.toLowerCase())) return null;
  return { email: data.user.email };
}

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
  const admin = await verifyAdmin(req);
  if (!admin) {
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
    return NextResponse.json(
      { error: "Failed to update venue", details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ venue: mapVenue(data as Record<string, unknown>) });
}
