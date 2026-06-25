import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { computeLevel } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type RewardsResponse = {
  points_total: number;
  level: "newcomer" | "regular" | "local" | "insider";
  streak_count: number;
  trusted_reporter: boolean;
  confirmed_checkins: number;
};

async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function GET(req: NextRequest): Promise<NextResponse<RewardsResponse | { error: string }>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
    }
    throw error;
  }

  const userId = await getBearerUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_scores")
    .select("points_total, level, streak_count, trusted_reporter, confirmed_checkins")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profile/rewards GET] DB error:", error);
    return NextResponse.json({ error: "Could not load rewards." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      points_total: 0,
      level: "newcomer",
      streak_count: 0,
      trusted_reporter: false,
      confirmed_checkins: 0,
    });
  }

  const confirmedCheckins = Number(data.confirmed_checkins ?? 0);
  return NextResponse.json({
    points_total: Number(data.points_total ?? 0),
    level: computeLevel(confirmedCheckins),
    streak_count: Number(data.streak_count ?? 0),
    trusted_reporter: Boolean(data.trusted_reporter),
    confirmed_checkins: confirmedCheckins,
  });
}
