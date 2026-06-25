import { NextResponse } from "next/server";
import { getBusynessState } from "@/lib/busyness";
import { getConsumerVenueById } from "@/lib/consumerVenue";

const siteUrl = "https://nytchkr.com";

type ShareCardResponse = {
  shareUrl: string;
  text: string;
};

function buildShareText(venueName: string, busynessScore: number | null | undefined): string {
  if (busynessScore == null || !Number.isFinite(busynessScore)) {
    return `${venueName} on NightVibe — check the vibe!`;
  }

  return `${venueName} is ${getBusynessState(busynessScore).label} right now on NightVibe`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ShareCardResponse | { error: string }>> {
  const { id } = await params;
  const venue = await getConsumerVenueById(id);

  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const shareUrl = `${siteUrl}/venues/${encodeURIComponent(venue.id)}?ref=share`;
  const busynessScore = venue.signal?.busyness0To100 ?? null;

  return NextResponse.json({
    shareUrl,
    text: buildShareText(venue.name, busynessScore),
  });
}
