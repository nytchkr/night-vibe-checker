import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { findVisibleVenueByIdOrPlaceId } from "@/lib/venueLookup";
import { MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SaveBodySchema = z.object({
  alertThreshold: z.number().int().min(0).max(100).optional(),
});

const VENUE_ID_SELECT = "id, place_id";

function configError(error: unknown) {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
}

async function readBody(req: NextRequest) {
  try {
    return SaveBodySchema.parse(await req.json());
  } catch {
    return {};
  }
}

async function getCanonicalVenueId(rawId: string): Promise<string | null> {
  const { data, error } = await findVisibleVenueByIdOrPlaceId(rawId, VENUE_ID_SELECT);
  if (error || !data?.id) return null;
  return String(data.id);
}

async function requireUser(req: NextRequest): Promise<string | NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return userId;
  } catch (error) {
    const response = configError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (typeof user !== "string") return user;

  const { id } = await params;
  const venueId = await getCanonicalVenueId(id);
  if (!venueId) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const existing = await supabaseAdmin
    .from("saved_venues")
    .select("id")
    .eq("user_id", user)
    .eq("venue_id", venueId)
    .limit(1);

  if (existing.error) {
    console.error("[venues save POST] DB error:", existing.error);
    return NextResponse.json({ error: "Could not read saved venue." }, { status: 500 });
  }

  const existingRows = Array.isArray(existing.data) ? existing.data : [];
  if (existingRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("saved_venues")
      .delete()
      .eq("user_id", user)
      .eq("venue_id", venueId);

    if (error) {
      console.error("[venues save POST] DB error:", error);
      return NextResponse.json({ error: "Could not unsave venue." }, { status: 500 });
    }

    return NextResponse.json({ data: { venueId, saved: false }, venueId, saved: false });
  }

  const body = await readBody(req);
  const { error } = await supabaseAdmin.from("saved_venues").upsert(
    {
      user_id: user,
      venue_id: venueId,
      alert_threshold: body.alertThreshold ?? 70,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,venue_id" },
  );

  if (error) {
    console.error("[venues save POST] DB error:", error);
    return NextResponse.json({ error: "Could not save venue." }, { status: 500 });
  }

  return NextResponse.json({ data: { venueId, saved: true }, venueId, saved: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (typeof user !== "string") return user;

  const { id } = await params;
  const venueId = await getCanonicalVenueId(id);
  if (!venueId) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("saved_venues")
    .select("id")
    .eq("user_id", user)
    .eq("venue_id", venueId)
    .limit(1);

  if (error) {
    console.error("[venues save GET] DB error:", error);
    return NextResponse.json({ error: "Could not read saved venue." }, { status: 500 });
  }

  return NextResponse.json({ data: { venueId, saved: (data ?? []).length > 0 }, venueId, saved: (data ?? []).length > 0 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (typeof user !== "string") return user;

  const { id } = await params;
  const venueId = await getCanonicalVenueId(id);
  if (!venueId) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const body = await readBody(req);
  if (body.alertThreshold == null) {
    return NextResponse.json({ error: "alertThreshold is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("saved_venues")
    .update({ alert_threshold: body.alertThreshold })
    .eq("user_id", user)
    .eq("venue_id", venueId);

  if (error) {
    console.error("[venues save PATCH] DB error:", error);
    return NextResponse.json({ error: "Could not update alert threshold." }, { status: 500 });
  }

  return NextResponse.json({ data: { venueId, alertThreshold: body.alertThreshold }, venueId, alertThreshold: body.alertThreshold });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (typeof user !== "string") return user;

  const { id } = await params;
  const venueId = await getCanonicalVenueId(id);
  if (!venueId) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("saved_venues")
    .delete()
    .eq("user_id", user)
    .eq("venue_id", venueId);

  if (error) {
    console.error("[venues save DELETE] DB error:", error);
    return NextResponse.json({ error: "Could not unsave venue." }, { status: 500 });
  }

  return NextResponse.json({ data: { venueId, saved: false }, venueId, saved: false });
}
