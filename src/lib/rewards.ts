import { sql } from "@/lib/db";
import { distanceMeters } from "@/lib/distance";

export type Level = "newcomer" | "regular" | "local" | "insider";
export type PointsEventType = "checkin" | "first_report" | "agreement_bonus" | "streak" | "penalty" | (string & {});

export const LEVEL_THRESHOLDS: Record<Level, number> = {
  // Thresholds are based on confirmed check-ins: 0/5/20/50.
  newcomer: 0,
  regular: 5,
  local: 20,
  insider: 50,
};

type UserScoreRow = {
  user_id: string;
  points_total: number;
  level: Level;
  streak_count: number;
  trusted_reporter: boolean;
  flagged_for_review: boolean;
  confirmed_checkins: number;
};

export function computeLevel(confirmedCheckins: number): Level {
  if (confirmedCheckins >= LEVEL_THRESHOLDS.insider) return "insider";
  if (confirmedCheckins >= LEVEL_THRESHOLDS.local) return "local";
  if (confirmedCheckins >= LEVEL_THRESHOLDS.regular) return "regular";
  return "newcomer";
}

export async function updateUserScore(
  userId: string,
  delta: number,
  eventType: PointsEventType,
  reason: string,
  checkinId?: string,
): Promise<void> {
  await sql`
    INSERT INTO user_scores (user_id)
    VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `;
  await sql`
    INSERT INTO points_events (user_id, points_delta, event_type, reason, checkin_id)
    VALUES (${userId}, ${delta}, ${eventType}, ${reason}, ${checkinId ?? null})
  `;
  await sql`
    UPDATE user_scores
    SET
      points_total = COALESCE(points_total, 0) + ${delta},
      level = CASE
        WHEN COALESCE(confirmed_checkins, 0) >= ${LEVEL_THRESHOLDS.insider} THEN 'insider'
        WHEN COALESCE(confirmed_checkins, 0) >= ${LEVEL_THRESHOLDS.local} THEN 'local'
        WHEN COALESCE(confirmed_checkins, 0) >= ${LEVEL_THRESHOLDS.regular} THEN 'regular'
        ELSE 'newcomer'
      END,
      trusted_reporter = COALESCE(confirmed_checkins, 0) >= ${LEVEL_THRESHOLDS.local},
      last_checkin_at = CASE WHEN ${eventType} = 'checkin' THEN now() ELSE last_checkin_at END,
      updated_at = now()
    WHERE user_id = ${userId}
  `;
}

export async function incrementConfirmedCheckins(userId: string): Promise<void> {
  await sql`
    INSERT INTO user_scores (user_id, confirmed_checkins)
    VALUES (${userId}, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      confirmed_checkins = COALESCE(user_scores.confirmed_checkins, 0) + 1,
      level = CASE
        WHEN COALESCE(user_scores.confirmed_checkins, 0) + 1 >= ${LEVEL_THRESHOLDS.insider} THEN 'insider'
        WHEN COALESCE(user_scores.confirmed_checkins, 0) + 1 >= ${LEVEL_THRESHOLDS.local} THEN 'local'
        WHEN COALESCE(user_scores.confirmed_checkins, 0) + 1 >= ${LEVEL_THRESHOLDS.regular} THEN 'regular'
        ELSE 'newcomer'
      END,
      trusted_reporter = COALESCE(user_scores.confirmed_checkins, 0) + 1 >= ${LEVEL_THRESHOLDS.local},
      updated_at = now()
  `;
}

export async function getUserScore(userId: string): Promise<UserScoreRow | null> {
  const rows = (await sql`
    SELECT user_id, points_total, level, streak_count, trusted_reporter, flagged_for_review, confirmed_checkins
    FROM user_scores
    WHERE user_id = ${userId}
    LIMIT 1
  `) as UserScoreRow[];
  const data = rows[0];
  return (data as UserScoreRow | undefined) ?? null;
}

export async function getUserTrustWeight(userId: string): Promise<number> {
  const score = await getUserScore(userId);
  if (!score) return 0.5;
  if (score.trusted_reporter && (score.level === "local" || score.level === "insider")) return 1.2;
  if (score.confirmed_checkins >= 1 || score.level === "regular") return 1.0;
  return 0.5;
}

export async function checkFirstReportOfNight(venueId: string, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM check_ins
    WHERE venue_id = ${venueId}
      AND user_id <> ${userId}
      AND created_at >= ${cutoff}
      AND hidden = false
  `) as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0) === 0;
}

export async function checkStreakBonus(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
  const [checkIns, streakRows] = await Promise.all([
    sql`
      SELECT created_at
      FROM check_ins
      WHERE user_id = ${userId}
        AND hidden = false
        AND created_at >= ${cutoff}
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM points_events
      WHERE user_id = ${userId}
        AND event_type = 'streak'
        AND created_at >= ${cutoff}
    `,
  ]) as [Array<{ created_at: string | null }>, Array<{ count: number }>];

  const dates = new Set(
    checkIns
      .map((row) => dateKey(row.created_at))
      .filter((value): value is string => Boolean(value)),
  );

  return dates.size >= 3 && Number(streakRows[0]?.count ?? 0) === 0;
}

export async function refreshStreakCount(userId: string): Promise<number> {
  const streakCount = await getRollingDistinctCheckInDayCount(userId);
  await sql`
    INSERT INTO user_scores (user_id, streak_count, updated_at)
    VALUES (${userId}, ${streakCount}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      streak_count = EXCLUDED.streak_count,
      updated_at = EXCLUDED.updated_at
  `;
  return streakCount;
}

export async function checkAbuseSoftSignals(
  userId: string,
  venueId: string,
  lat: number,
  lng: number,
): Promise<{ shouldFlag: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  const lastCheckInRows = (await sql`
    SELECT id, venue_id, lat_reported, lng_reported, created_at
    FROM check_ins
    WHERE user_id = ${userId}
      AND lat_reported IS NOT NULL
      AND lng_reported IS NOT NULL
      AND venue_id <> ${venueId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ lat_reported: number; lng_reported: number; created_at: string }>;
  const lastCheckIn = lastCheckInRows[0];

  const previous = lastCheckIn as { lat_reported: number; lng_reported: number; created_at: string } | null;
  if (previous) {
    const minutes = (Date.now() - new Date(previous.created_at).getTime()) / 60_000;
    if (Number.isFinite(minutes) && minutes > 0) {
      const km = distanceMeters(previous.lat_reported, previous.lng_reported, lat, lng) / 1000;
      const achievableKm = (60 * minutes) / 60;
      if (km > achievableKm) reasons.push("impossible_travel");
    }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const [penaltyRows, checkinRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS count
      FROM points_events
      WHERE user_id = ${userId}
        AND event_type = 'penalty'
        AND created_at >= ${cutoff}
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM points_events
      WHERE user_id = ${userId}
        AND event_type = 'checkin'
        AND created_at >= ${cutoff}
    `,
  ]) as [Array<{ count: number }>, Array<{ count: number }>];

  const totalCheckins = Number(checkinRows[0]?.count ?? 0);
  if (totalCheckins > 0 && Number(penaltyRows[0]?.count ?? 0) / totalCheckins > 0.4) {
    reasons.push("high_penalty_rate");
  }

  return { shouldFlag: reasons.length > 0, reasons };
}

export async function flagUserForReview(userId: string): Promise<void> {
  await sql`
    INSERT INTO user_scores (user_id, flagged_for_review, updated_at)
    VALUES (${userId}, true, now())
    ON CONFLICT (user_id) DO UPDATE SET
      flagged_for_review = true,
      updated_at = now()
  `;
}

async function getRollingDistinctCheckInDayCount(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
  const data = (await sql`
    SELECT created_at
    FROM check_ins
    WHERE user_id = ${userId}
      AND hidden = false
      AND created_at >= ${cutoff}
  `) as Array<{ created_at: string | null }>;

  return new Set(
    data
      .map((row) => dateKey(row.created_at))
      .filter((value): value is string => Boolean(value)),
  ).size;
}

function dateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
