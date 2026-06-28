import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { computeLevel } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type RewardsResponse = {
  points_total: number;
  level: "newcomer" | "regular" | "local" | "insider";
  streak_count: number;
  trusted_reporter: boolean;
  confirmed_checkins: number;
};

export async function GET(req: NextRequest): Promise<NextResponse<RewardsResponse | { error: string }>> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = (await sql`
    SELECT points_total, level, streak_count, trusted_reporter, confirmed_checkins
    FROM user_scores
    WHERE user_id = ${userId}
    LIMIT 1
  `) as Array<Partial<RewardsResponse>>;

  if (!rows[0]) {
    return NextResponse.json({
      points_total: 0,
      level: "newcomer",
      streak_count: 0,
      trusted_reporter: false,
      confirmed_checkins: 0,
    });
  }

  const data = rows[0];
  const confirmedCheckins = Number(data.confirmed_checkins ?? 0);
  return NextResponse.json({
    points_total: Number(data.points_total ?? 0),
    level: computeLevel(confirmedCheckins),
    streak_count: Number(data.streak_count ?? 0),
    trusted_reporter: Boolean(data.trusted_reporter),
    confirmed_checkins: confirmedCheckins,
  });
}
