import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { getBusynessState } from "@/lib/busyness";
import { getConsumerVenueById } from "@/lib/consumerVenue";

const siteUrl = "https://nytchkr.com";

type ShareCardResponse = {
  shareUrl: string;
  text: string;
};

function buildShareText(venueName: string, busynessScore: number | null | undefined): string {
  if (busynessScore == null || !Number.isFinite(busynessScore)) {
    return `${venueName} on nytchkr — check the vibe!`;
  }

  return `${venueName} is ${getBusynessState(busynessScore).label} right now on nytchkr`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ShareCardResponse | { error: string }>> {
  const rate = await publicRateLimit(request, "venue-share-card", 60);
  if (rate.response) return rate.response as NextResponse<ShareCardResponse | { error: string }>;
  const { id } = await params;
  const venue = await getConsumerVenueById(id);

  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404, headers: rate.headers });
  }

  const shareUrl = `${siteUrl}/venues/${encodeURIComponent(venue.id)}?ref=share`;
  const busynessScore = venue.signal?.busyness0To100 ?? null;

  return NextResponse.json({
    shareUrl,
    text: buildShareText(venue.name, busynessScore),
  }, { headers: rate.headers });
}
