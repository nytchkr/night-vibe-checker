import { NextRequest, NextResponse } from "next/server";
import {
  getRequestUserId,
  getUserSubscriptionStatus,
  isActiveProSubscription,
} from "@/lib/subscription";
import { normalizeVenueLookupId } from "@/lib/venueLookup";

export const dynamic = "force-dynamic";

const STUB_PREDICTION = {
  peakHour: 23,
  peakBusyness: 85,
  bestArrivalHour: 21,
  crowdTrend: "rising" as const,
  confidenceScore: 0.72,
  summary: "Expected to peak around 11pm. Arrive by 9pm for best experience.",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const subscription = await getUserSubscriptionStatus(userId);
  if (!isActiveProSubscription(subscription)) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const venueId = normalizeVenueLookupId(rawId);
  if (!venueId) {
    return NextResponse.json({ error: "venue_id_required" }, { status: 400 });
  }

  return NextResponse.json(
    {
      venueId,
      generatedAt: new Date().toISOString(),
      isStub: true,
      prediction: STUB_PREDICTION,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
