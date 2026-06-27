import { NextRequest, NextResponse } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import type { APIResponse, ConsumerVenue } from "@/types";

export const dynamic = "force-dynamic";

const WIDGET_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
): Promise<NextResponse> {
  const rate = publicRateLimit(req, "widget", 60);
  if (rate.response) return rate.response;
  const headers = { ...WIDGET_CACHE_HEADERS, ...rate.headers };
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
      { status: 404, headers }
    );
  }

  return NextResponse.json<APIResponse<{ venue: ConsumerVenue; signal: ConsumerVenue["signal"] }>>(
    {
      status: "success",
      data: { venue, signal: venue.signal },
      meta: { cached: true, generatedAt },
    },
    { headers }
  );
}
