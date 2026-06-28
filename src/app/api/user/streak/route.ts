import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { assertSupabaseServerEnv, MissingSupabaseEnvError } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CheckInRow = {
  created_at: string | null;
};

export type UserStreakResponse = {
  streak: number;
  lastCheckinDate: string | null;
};

type UserStreakErrorResponse =
  | { error: string }
  | { status: "error"; error: { code: "DB_ERROR"; message: string } };

const ET_TIME_ZONE = "America/New_York";

export async function GET(req: NextRequest): Promise<NextResponse<UserStreakResponse | UserStreakErrorResponse>> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 });
    }
    throw error;
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const data = await sql`
    SELECT created_at
    FROM check_ins
    WHERE user_id = ${userId}
      AND hidden = false
    ORDER BY created_at DESC
  `;

  return NextResponse.json(calculateUserStreak(data as CheckInRow[]), {
    headers: { "Cache-Control": "private, no-cache" },
  });
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
