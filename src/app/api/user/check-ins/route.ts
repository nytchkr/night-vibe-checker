import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { ReportedBusyness } from "@/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache",
};

type VenueRelation = {
  name?: string | null;
  address?: string | null;
};

type CheckInRecord = {
  id: string;
  venue_id: string | null;
  busyness: ReportedBusyness | null;
  created_at: string;
  venues?: VenueRelation | VenueRelation[] | null;
};

type UserCheckIn = {
  id: string;
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  busyness: ReportedBusyness | null;
  createdAt: string;
};

type UserCheckInsResponse = {
  data: {
    checkIns: UserCheckIn[];
  };
  nextCursor: string | null;
};

type UserCheckInsErrorResponse = {
  error: string;
};

export async function GET(
  req: NextRequest,
): Promise<NextResponse<UserCheckInsResponse | UserCheckInsErrorResponse>> {
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

  const cursor = req.nextUrl.searchParams.get("cursor");
  let query = supabaseAdmin
    .from("check_ins")
    .select("id,venue_id,busyness,created_at,venues(name,address)")
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[user/check-ins GET] check_ins DB error:", error);
    return NextResponse.json(
      { error: "Could not fetch check-in history." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const checkIns = ((data ?? []) as CheckInRecord[]).map(mapCheckIn);
  const nextCursor = checkIns.length === PAGE_SIZE ? checkIns[checkIns.length - 1]?.createdAt ?? null : null;

  return NextResponse.json(
    {
      data: { checkIns },
      nextCursor,
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

function mapCheckIn(row: CheckInRecord): UserCheckIn {
  const venue = venueFrom(row);

  return {
    id: row.id,
    venueId: row.venue_id,
    venueName: venue?.name ?? null,
    venueAddress: venue?.address ?? null,
    busyness: row.busyness,
    createdAt: row.created_at,
  };
}

function venueFrom(row: CheckInRecord): VenueRelation | null {
  const relation = row.venues;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}
