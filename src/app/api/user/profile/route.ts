import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { calculateUserStreak } from "@/app/api/user/streak/route";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type VenueRelation = {
  name?: string | null;
};

type CheckInVenueRow = {
  venue_id: string | null;
  venues?: VenueRelation | VenueRelation[] | null;
};

type CheckInStreakRow = {
  created_at: string | null;
};

type TopVenue = {
  venueId: string;
  venueName: string | null;
  checkInCount: number;
};

type UserProfileResponse = {
  userId: string;
  totalCheckIns: number;
  uniqueVenues: number;
  streak: number;
  topVenues: TopVenue[];
};

type UserProfileErrorResponse = {
  error: string;
};

export async function GET(
  req: NextRequest,
): Promise<NextResponse<UserProfileResponse | UserProfileErrorResponse>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    throw error;
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const [totalResult, streakResult, venueResult] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("hidden", false),
    supabaseAdmin
      .from("check_ins")
      .select("created_at")
      .eq("user_id", userId)
      .eq("hidden", false)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("check_ins")
      .select("venue_id,venues(name)")
      .eq("user_id", userId)
      .eq("hidden", false),
  ]);

  if (totalResult.error || streakResult.error || venueResult.error) {
    console.error("[user/profile GET] check_ins DB error:", {
      totalError: totalResult.error,
      streakError: streakResult.error,
      venueError: venueResult.error,
    });
    return NextResponse.json(
      { error: "Could not fetch profile summary." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const venueRows = (venueResult.data ?? []) as CheckInVenueRow[];
  const streakRows = (streakResult.data ?? []) as CheckInStreakRow[];
  const { topVenues, uniqueVenues } = summarizeVenues(venueRows);

  return NextResponse.json(
    {
      userId,
      totalCheckIns: totalResult.count ?? streakRows.length,
      uniqueVenues,
      streak: calculateUserStreak(streakRows).streak,
      topVenues,
    },
    { headers: NO_STORE_HEADERS },
  );
}

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function summarizeVenues(rows: CheckInVenueRow[]): { topVenues: TopVenue[]; uniqueVenues: number } {
  const venueCounts = new Map<string, { venueName: string | null; checkInCount: number }>();

  for (const row of rows) {
    if (!row.venue_id) continue;

    const existing = venueCounts.get(row.venue_id);
    venueCounts.set(row.venue_id, {
      venueName: existing?.venueName ?? venueFrom(row)?.name ?? null,
      checkInCount: (existing?.checkInCount ?? 0) + 1,
    });
  }

  return {
    uniqueVenues: venueCounts.size,
    topVenues: [...venueCounts.entries()]
      .map(([venueId, venue]) => ({ venueId, ...venue }))
      .sort((a, b) => b.checkInCount - a.checkInCount || compareNullableNames(a.venueName, b.venueName))
      .slice(0, 3),
  };
}

function venueFrom(row: CheckInVenueRow): VenueRelation | null {
  const relation = row.venues;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function compareNullableNames(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}
