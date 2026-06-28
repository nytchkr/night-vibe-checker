import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { findVisibleVenueByIdOrPlaceId } from "@/lib/venueLookup";
import { sql } from "@/lib/db";
import { MissingSupabaseEnvError } from "@/lib/supabase";

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

  const existingRows = (await sql`
    SELECT id
    FROM saved_venues
    WHERE user_id = ${user}
      AND venue_id = ${venueId}
    LIMIT 1
  `) as Array<{ id: string }>;
  if (existingRows.length > 0) {
    await sql`
      DELETE FROM saved_venues
      WHERE user_id = ${user}
        AND venue_id = ${venueId}
    `;

    return NextResponse.json({ data: { venueId, saved: false }, venueId, saved: false });
  }

  const body = await readBody(req);
  await sql`
    INSERT INTO saved_venues (user_id, venue_id, alert_threshold, created_at)
    VALUES (${user}, ${venueId}, ${body.alertThreshold ?? 70}, now())
    ON CONFLICT (user_id, venue_id) DO UPDATE SET
      alert_threshold = EXCLUDED.alert_threshold
  `;

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

  const data = (await sql`
    SELECT id
    FROM saved_venues
    WHERE user_id = ${user}
      AND venue_id = ${venueId}
    LIMIT 1
  `) as Array<{ id: string }>;

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

  await sql`
    UPDATE saved_venues
    SET alert_threshold = ${body.alertThreshold}
    WHERE user_id = ${user}
      AND venue_id = ${venueId}
  `;

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

  await sql`
    DELETE FROM saved_venues
    WHERE user_id = ${user}
      AND venue_id = ${venueId}
  `;

  return NextResponse.json({ data: { venueId, saved: false }, venueId, saved: false });
}
