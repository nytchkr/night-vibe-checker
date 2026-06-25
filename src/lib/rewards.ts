import { supabaseAdmin } from "@/lib/supabase";
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
  const { error } = await supabaseAdmin.rpc("apply_points_event", {
    p_user_id: userId,
    p_delta: delta,
    p_event_type: eventType,
    p_reason: reason,
    p_checkin_id: checkinId ?? null,
  });

  if (error) throw error;
}

export async function incrementConfirmedCheckins(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_confirmed_checkins_and_recompute", {
    p_user_id: userId,
  });

  if (error) throw error;
}

export async function getUserScore(userId: string): Promise<UserScoreRow | null> {
  const { data, error } = await supabaseAdmin
    .from("user_scores")
    .select("user_id, points_total, level, streak_count, trusted_reporter, flagged_for_review, confirmed_checkins")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as UserScoreRow | null) ?? null;
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
  const { count, error } = await supabaseAdmin
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .neq("user_id", userId)
    .gte("created_at", cutoff)
    .eq("hidden", false);

  if (error) throw error;
  return (count ?? 0) === 0;
}

export async function checkStreakBonus(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
  const [{ data: checkIns, error: checkInsError }, { count: streakEvents, error: eventsError }] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("created_at")
      .eq("user_id", userId)
      .eq("hidden", false)
      .gte("created_at", cutoff),
    supabaseAdmin
      .from("points_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "streak")
      .gte("created_at", cutoff),
  ]);

  if (checkInsError) throw checkInsError;
  if (eventsError) throw eventsError;

  const dates = new Set(
    ((checkIns ?? []) as Array<{ created_at: string | null }>)
      .map((row) => dateKey(row.created_at))
      .filter((value): value is string => Boolean(value)),
  );

  return dates.size >= 3 && (streakEvents ?? 0) === 0;
}

export async function refreshStreakCount(userId: string): Promise<number> {
  const streakCount = await getRollingDistinctCheckInDayCount(userId);
  const { error } = await supabaseAdmin
    .from("user_scores")
    .upsert({ user_id: userId, streak_count: streakCount, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) throw error;
  return streakCount;
}

export async function checkAbuseSoftSignals(
  userId: string,
  venueId: string,
  lat: number,
  lng: number,
): Promise<{ shouldFlag: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  const { data: lastCheckIn, error: lastError } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, lat_reported, lng_reported, created_at")
    .eq("user_id", userId)
    .not("lat_reported", "is", null)
    .not("lng_reported", "is", null)
    .neq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw lastError;

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
  const [{ count: penaltyCount, error: penaltyError }, { count: checkinCount, error: checkinError }] = await Promise.all([
    supabaseAdmin
      .from("points_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "penalty")
      .gte("created_at", cutoff),
    supabaseAdmin
      .from("points_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "checkin")
      .gte("created_at", cutoff),
  ]);

  if (penaltyError) throw penaltyError;
  if (checkinError) throw checkinError;

  const totalCheckins = checkinCount ?? 0;
  if (totalCheckins > 0 && (penaltyCount ?? 0) / totalCheckins > 0.4) {
    reasons.push("high_penalty_rate");
  }

  return { shouldFlag: reasons.length > 0, reasons };
}

export async function flagUserForReview(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_scores")
    .upsert({ user_id: userId, flagged_for_review: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) throw error;
}

async function getRollingDistinctCheckInDayCount(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("created_at")
    .eq("user_id", userId)
    .eq("hidden", false)
    .gte("created_at", cutoff);

  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ created_at: string | null }>)
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
