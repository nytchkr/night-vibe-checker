// ============================================================
// GET /api/profile/streak — signed-in user's check-in streak summary
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type StreakResponse = {
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
};

type CheckInRow = {
  created_at: string | null;
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

export async function GET(req: NextRequest): Promise<NextResponse<StreakResponse | { error: string }>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const userId = (await getCookieUserId(req)) ?? (await getBearerUserId(req));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error, count } = await supabaseAdmin
    .from("check_ins")
    .select("created_at", { count: "exact" })
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not fetch streak." }, { status: 500 });
  }

  const rows = (data ?? []) as CheckInRow[];
  const checkInDays = new Set(
    rows
      .map((row) => toCharlotteDateKey(row.created_at))
      .filter((day): day is string => Boolean(day)),
  );

  return NextResponse.json({
    currentStreak: getCurrentStreak(checkInDays),
    longestStreak: getLongestStreak(checkInDays),
    totalCheckIns: count ?? rows.length,
  });
}

function toCharlotteDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function offsetDateKey(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return toCharlotteDateKey(date.toISOString()) ?? "";
}

function getCurrentStreak(checkInDays: Set<string>): number {
  let streak = 0;

  while (checkInDays.has(offsetDateKey(streak))) {
    streak += 1;
  }

  return streak;
}

function getLongestStreak(checkInDays: Set<string>): number {
  const sortedDays = [...checkInDays].sort();
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;

  for (const day of sortedDays) {
    const date = new Date(`${day}T12:00:00-05:00`);
    const isConsecutive = previous
      ? Math.round((date.getTime() - previous.getTime()) / 86_400_000) === 1
      : false;

    current = isConsecutive ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }

  return longest;
}
