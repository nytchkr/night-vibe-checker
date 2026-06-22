// ============================================================
// GET /api/profile/check-ins — signed-in user's recent vibes
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ProfileCheckInRow = {
  id: string;
  venue_id: string;
  venue_name: string | null;
  busyness: string | null;
  crowd_feel: string | null;
  note: string | null;
  created_at: string;
};

type CheckInRecord = {
  id: string;
  venue_id: string | null;
  busyness: string | null;
  crowd_feel: string | null;
  note: string | null;
  created_at: string;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

async function getCookieUserId(req: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll().map(({ name, value }) => ({ name, value })),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

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

function venueNameFrom(row: CheckInRecord): string | null {
  const venues = row.venues;
  if (Array.isArray(venues)) return venues[0]?.name ?? null;
  return venues?.name ?? null;
}

function mapRow(row: CheckInRecord): ProfileCheckInRow {
  return {
    id: row.id,
    venue_id: row.venue_id ?? "",
    venue_name: venueNameFrom(row),
    busyness: row.busyness,
    crowd_feel: row.crowd_feel,
    note: row.note,
    created_at: row.created_at,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<ProfileCheckInRow[]>> {
  const userId = (await getCookieUserId(req)) ?? (await getBearerUserId(req));
  if (!userId) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id,venue_id,busyness,crowd_feel,note,created_at,venues(name)")
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[profile/check-ins GET] DB error:", error);
    return NextResponse.json([]);
  }

  return NextResponse.json(((data ?? []) as CheckInRecord[]).map(mapRow));
}
