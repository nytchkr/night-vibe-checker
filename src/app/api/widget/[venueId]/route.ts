import { NextRequest, NextResponse } from "next/server";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import type { APIResponse, ConsumerVenue } from "@/types";

const WIDGET_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
): Promise<NextResponse> {
  const generatedAt = new Date().toISOString();
  const { venueId } = await params;
  const venue = await getConsumerVenueById(venueId);

  if (!venue) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VENUE_NOT_FOUND", message: "Venue was not found in the cached launch-zone database." },
        meta: { cached: true, generatedAt },
      },
      { status: 404, headers: WIDGET_CACHE_HEADERS }
    );
  }

  return NextResponse.json<APIResponse<{ venue: ConsumerVenue; signal: ConsumerVenue["signal"] }>>(
    {
      status: "success",
      data: { venue, signal: venue.signal },
      meta: { cached: true, generatedAt },
    },
    { headers: WIDGET_CACHE_HEADERS }
  );
}
