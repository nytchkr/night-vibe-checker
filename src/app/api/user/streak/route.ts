import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CheckInRow = {
  created_at: string | null;
};

export type UserStreakResponse = {
  streak: number;
  lastCheckinDate: string | null;
};

const ET_TIME_ZONE = "America/New_York";

export async function GET(req: NextRequest): Promise<NextResponse<UserStreakResponse | { error: string }>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
    }
    throw error;
  }

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("created_at")
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[user/streak GET] check_ins DB error:", error);
    return NextResponse.json({ error: "Could not fetch streak." }, { status: 500 });
  }

  return NextResponse.json(calculateUserStreak((data ?? []) as CheckInRow[]), {
    headers: { "Cache-Control": "private, no-cache" },
  });
}

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function calculateUserStreak(rows: CheckInRow[], now = new Date()): UserStreakResponse {
  const checkInDays = new Set<string>();

  for (const row of rows) {
    const dateKey = toEtDateKey(row.created_at);
    if (dateKey) checkInDays.add(dateKey);
  }

  let streak = 0;
  while (checkInDays.has(etDateKeyDaysAgo(now, streak))) {
    streak += 1;
  }

  return {
    streak,
    lastCheckinDate: latestDateKey(checkInDays),
  };
}

export function toEtDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function etDateKeyDaysAgo(now: Date, daysAgo: number): string {
  const today = toEtDateKey(now.toISOString());
  if (!today) return "";

  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - daysAgo, 12, 0, 0));
  return toEtDateKey(date.toISOString()) ?? "";
}

function latestDateKey(days: Set<string>): string | null {
  return [...days].sort((a, b) => b.localeCompare(a))[0] ?? null;
}
