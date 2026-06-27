import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { calculateUserStreak } from "@/app/api/user/streak/route";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache",
};

type VenueRelation = {
  name?: string | null;
};

type CheckInRecord = {
  venue_id: string | null;
  created_at: string | null;
  venues?: VenueRelation | VenueRelation[] | null;
};

type TopVenue = {
  venueId: string;
  venueName: string | null;
  checkIns: number;
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

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("venue_id,created_at,venues(name)")
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[user/profile GET] check_ins DB error:", error);
    return NextResponse.json(
      { error: "Could not fetch user profile." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const rows = (data ?? []) as CheckInRecord[];
  const streakSummary = calculateUserStreak(rows.map(({ created_at }) => ({ created_at })));

  return NextResponse.json(
    {
      userId,
      totalCheckIns: rows.length,
      uniqueVenues: new Set(rows.map((row) => row.venue_id).filter(Boolean)).size,
      streak: streakSummary.streak,
      topVenues: topVenuesFrom(rows),
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

function topVenuesFrom(rows: CheckInRecord[]): TopVenue[] {
  const byVenue = new Map<string, TopVenue>();

  for (const row of rows) {
    if (!row.venue_id) continue;
    const existing = byVenue.get(row.venue_id);
    if (existing) {
      existing.checkIns += 1;
      continue;
    }

    byVenue.set(row.venue_id, {
      venueId: row.venue_id,
      venueName: venueNameFrom(row),
      checkIns: 1,
    });
  }

  return [...byVenue.values()]
    .sort((a, b) => b.checkIns - a.checkIns || a.venueId.localeCompare(b.venueId))
    .slice(0, 3);
}

function venueNameFrom(row: CheckInRecord): string | null {
  const relation = row.venues;
  if (Array.isArray(relation)) return relation[0]?.name ?? null;
  return relation?.name ?? null;
}
