import { NextResponse } from "next/server";
import { getMostActiveLeaderboard } from "@/lib/leaderboard";

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300",
};

export async function GET(): Promise<NextResponse> {
  try {
    const leaderboard = await getMostActiveLeaderboard();
    return NextResponse.json(leaderboard, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error("[leaderboard GET] DB error:", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Could not load leaderboard." } },
      { status: 500, headers: PUBLIC_CACHE_HEADERS }
    );
  }
}
