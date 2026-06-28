import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(req: NextRequest): Promise<NextResponse<{ isPro: boolean } | { error: string }>> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const [userRow, subscriptionRow] = await Promise.all([
    sql`
      SELECT pro, subscription_status
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT plan, status
      FROM subscriptions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `,
  ]) as [
    Array<{ pro?: boolean | null; subscription_status?: string | null }>,
    Array<{ plan?: string | null; status?: string | null }>,
  ];

  const user = userRow[0];
  const subscription = subscriptionRow[0];
  const status = user?.subscription_status?.toLowerCase();
  const subscriptionStatus = subscription?.status?.toLowerCase();
  const isPro =
    user?.pro === true ||
    status === "active" ||
    status === "trialing" ||
    (subscription?.plan?.toLowerCase() === "pro" && (subscriptionStatus === "active" || subscriptionStatus === "trialing"));

  return NextResponse.json({ isPro }, { headers: NO_STORE_HEADERS });
}
