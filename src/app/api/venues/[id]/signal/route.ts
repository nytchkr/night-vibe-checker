// ============================================================
// GET /api/venues/[id]/signal
// Returns the current VenueSignal row for a venue.
//
// Response shape:
//   { venueId, busyness, busynessSource, confidence, computedAt }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { sql } from "@/lib/db";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";

export interface VenueSignalResponse {
  venueId: string;
  busyness: number | null;
  busynessSource: "live" | "forecast" | "crowd" | "unavailable" | null;
  confidence: number;
  computedAt: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rate = await publicRateLimit(req, "venue-signal", 60);
  if (rate.response) return rate.response;
  const headers = rate.headers;
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: false, generatedAt, requestId };

  const { id: rawId } = await params;
  const id = normalizeVenueLookupId(rawId);

  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta,
      },
      { status: 400, headers }
    );
  }

  // Accept both internal UUID and Google place_id
  const { data: venue, error: venueError } = await findVisibleVenueByIdOrPlaceId(id, "id");

  if (venueError || !venue) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VENUE_NOT_FOUND", message: "Venue was not found." },
        meta,
      },
      { status: 404, headers }
    );
  }

  const [signal] = (await sql`
    SELECT venue_id, busyness_0_100, busyness_source, confidence_0_1, computed_at
    FROM venue_signals
    WHERE venue_id = ${venue.id as string}
    LIMIT 1
  `) as Array<Record<string, unknown>>;

  const response: VenueSignalResponse = {
    venueId: venue.id as string,
    busyness: signal?.busyness_0_100 != null ? Number(signal.busyness_0_100) : null,
    busynessSource: (signal?.busyness_source ?? null) as VenueSignalResponse["busynessSource"],
    confidence: Number(signal?.confidence_0_1 ?? 0),
    computedAt: (signal?.computed_at ?? null) as string | null,
  };

  return NextResponse.json<APIResponse<VenueSignalResponse>>(
    { status: "success", data: response, meta },
    { status: 200, headers }
  );
}
