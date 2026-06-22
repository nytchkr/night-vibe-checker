import { NextRequest, NextResponse } from "next/server";
import {
  FREE_SUBSCRIPTION,
  getRequestUserId,
  getUserSubscriptionStatus,
} from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json(FREE_SUBSCRIPTION, { headers: { "Cache-Control": "private, no-store" } });

  const subscription = await getUserSubscriptionStatus(userId);
  return NextResponse.json(subscription, { headers: { "Cache-Control": "private, no-store" } });
}
