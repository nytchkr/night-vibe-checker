import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SavedVenueRow = {
  venue_id: string;
  created_at: string;
};

type VenueRow = {
  id: string;
  place_id: string | null;
  name: string | null;
};

type SavedVenueResponse = {
  venue_id: string;
  venue_name: string;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getCookieUserId(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function getUserId(req: NextRequest): Promise<string | null> {
  return (await getCookieUserId(req)) ?? (await getBearerUserId(req));
}

function missingConfigResponse(error: unknown): NextResponse<{ error: string }> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  console.error("[user/saved-venues GET] Supabase configuration error:", error.message);
  return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
}

async function loadVenues(savedVenueIds: string[]): Promise<Map<string, VenueRow>> {
  const venueMap = new Map<string, VenueRow>();
  const uuidIds = savedVenueIds.filter((id) => UUID_RE.test(id));

  if (uuidIds.length > 0) {
    const { data, error } = await supabaseAdmin.from("venues").select("id,place_id,name").in("id", uuidIds);
    if (error) throw error;
    for (const venue of (data ?? []) as VenueRow[]) {
      venueMap.set(venue.id, venue);
      if (venue.place_id) venueMap.set(venue.place_id, venue);
    }
  }

  const { data, error } = await supabaseAdmin.from("venues").select("id,place_id,name").in("place_id", savedVenueIds);
  if (error) throw error;
  for (const venue of (data ?? []) as VenueRow[]) {
    venueMap.set(venue.id, venue);
    if (venue.place_id) venueMap.set(venue.place_id, venue);
  }

  return venueMap;
}

export async function GET(req: NextRequest): Promise<NextResponse<SavedVenueResponse[] | { error: string }>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingConfigResponse(error);
    if (response) return response;
    throw error;
  }

  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: savedRows, error: savedError } = await supabaseAdmin
    .from("saved_venues")
    .select("venue_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (savedError) {
    console.error("[user/saved-venues GET] saved_venues DB error:", savedError);
    return NextResponse.json({ error: "Could not fetch saved venues." }, { status: 500 });
  }

  const rows = (savedRows ?? []) as SavedVenueRow[];
  const venueIds = rows.map((row) => row.venue_id).filter(Boolean);
  const venuesById = venueIds.length > 0 ? await loadVenues(venueIds) : new Map<string, VenueRow>();

  return NextResponse.json(
    rows.map((row) => {
      const venue = venuesById.get(row.venue_id);
      return {
        venue_id: venue?.id ?? row.venue_id,
        venue_name: venue?.name?.trim() || row.venue_id,
        created_at: row.created_at,
      };
    }),
    { headers: { "Cache-Control": "private, no-cache" } },
  );
}
