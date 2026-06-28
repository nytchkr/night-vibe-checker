import { sql } from "@/lib/db";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";
import type { CrowdFeel, ReportedBusyness } from "@/types";

export const SIGNAL_LOOKBACK_HOURS = 4;
export const MF_RATIO_LOOKBACK_DAYS = 7;
const BUSYNESS_LOOKBACK_MINUTES = SIGNAL_LOOKBACK_HOURS * 60;
const MF_RATIO_LOOKBACK_MINUTES = MF_RATIO_LOOKBACK_DAYS * 24 * 60;
const HALF_LIFE_MINUTES = 45;
const MIN_EFFECTIVE_GENDERED_REPORTS_FOR_RATIO = 2;

type SignalCheckInRow = {
  id: string;
  venue_id: string;
  place_id: string;
  user_id?: string | null;
  busyness: ReportedBusyness;
  crowd_feel: CrowdFeel;
  gender?: "M" | "F" | "prefer_not" | null;
  reporter_gender: "male" | "female" | null;
  gender_self_report?: "m" | "f" | "nb" | null;
  trust_weight?: number | null;
  created_at: string;
};

// Maps crowd-reported busyness to a 0-100 score.
// dead=16 (barely alive), moderate=50, packed=84 (very full).
function busynessToScore(busyness: ReportedBusyness): number {
  if (busyness === "dead") return 16;
  if (busyness === "packed") return 84;
  return 50; // moderate
}

function rowToBinaryGender(
  canonicalGender: SignalCheckInRow["gender"] = null,
  reporterGender: SignalCheckInRow["reporter_gender"],
  genderSelfReport: SignalCheckInRow["gender_self_report"] = null,
): "m" | "f" | null {
  if (canonicalGender === "M" || canonicalGender === "F") return canonicalGender.toLowerCase() as "m" | "f";
  if (genderSelfReport === "m" || genderSelfReport === "f") return genderSelfReport;
  if (reporterGender === "male") return "m";
  if (reporterGender === "female") return "f";
  return null;
}

// Recomputes the M/F and busyness signal from a set of recent check-in rows.
//
// Recency weight: w = 0.5 ^ (age_minutes / 45)  (half-life = 45 minutes)
// Busyness:      weighted average from recent check-ins
// M/F ratio:     male_count / (male_count + female_count) * 100 from 7-day check-ins
// Confidence:    gendered_count / (gendered_count + 3)
// gendered_count < 5 or effective gendered weight < 2: mf_ratio stays null
// sample_size:   M+F self-reported check-ins in the last 7 days
export function computeSignalFromCheckIns(rows: SignalCheckInRow[], nowMs = Date.now()) {
  let nEff = 0;
  let weightedBusyness = 0;
  let genderedCount = 0;
  let genderedEffectiveCount = 0;
  let maleCount = 0;

  const busynessRows = rows.filter((row) => {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) return false;
    return nowMs - createdAtMs <= BUSYNESS_LOOKBACK_MINUTES * 60_000;
  });

  for (const row of busynessRows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const tw = row.trust_weight ?? 1.0;
    const w = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES) * tw;

    nEff += w;
    weightedBusyness += busynessToScore(row.busyness) * w;
  }

  for (const row of rows) {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > MF_RATIO_LOOKBACK_MINUTES * 60_000) continue;

    const selfReport = rowToBinaryGender(row.gender, row.reporter_gender, row.gender_self_report);
    if (selfReport != null) {
      genderedCount += 1;
      genderedEffectiveCount += row.trust_weight ?? 1.0;
      if (selfReport === "m") maleCount += 1;
    }
  }

  const busyness0To100 = nEff > 0 ? Math.round(weightedBusyness / nEff) : null;
  const mfRatio = genderedCount >= MIN_SAMPLE_SIZE_FOR_RATIO && genderedEffectiveCount >= MIN_EFFECTIVE_GENDERED_REPORTS_FOR_RATIO
    ? (maleCount / genderedCount) * 100
    : null;
  const confidence0To1 = genderedCount > 0 ? genderedCount / (genderedCount + 3) : 0;

  return {
    busyness0To100,
    busynessSource: nEff > 0 ? ("crowd" as const) : null,
    mfRatio,
    confidence0To1: Math.max(0, Math.min(1, confidence0To1)),
    sampleSize: genderedCount,
  };
}

export async function recomputeVenueSignal(venueId: string) {
  const cutoff = new Date(Date.now() - MF_RATIO_LOOKBACK_MINUTES * 60_000).toISOString();

  const venueRows = (await sql`
    SELECT id, place_id, last_busyness_refresh
    FROM venues
    WHERE id = ${venueId}
      AND COALESCE(hidden, false) = false
    LIMIT 1
  `) as Array<{ id: string; place_id: string; last_busyness_refresh?: string | null }>;
  const venue = venueRows[0];

  if (!venue) throw new Error("Venue not found");

  const [rows, existingSignals] = await Promise.all([
    sql`
      SELECT
        id,
        venue_id,
        place_id,
        busyness,
        crowd_feel,
        user_id,
        gender,
        reporter_gender,
        gender_self_report,
        created_at
      FROM check_ins
      WHERE venue_id = ${venueId}
        AND hidden = false
        AND created_at >= ${cutoff}
      ORDER BY created_at DESC
    `,
    sql`
      SELECT busyness_0_100, busyness_source, last_busyness_refresh
      FROM venue_signals
      WHERE venue_id = ${venueId}
      LIMIT 1
    `,
  ]) as [SignalCheckInRow[], Array<{ busyness_0_100?: number | null; busyness_source?: string | null; last_busyness_refresh?: string | null }>];

  const existingSignal = existingSignals[0] as
    | { busyness_0_100?: number | null; busyness_source?: string | null; last_busyness_refresh?: string | null }
    | undefined;

  const scoreByUserId = await getScoreByUserId(rows as Array<SignalCheckInRow>);
  const signalRows = (rows as SignalCheckInRow[]).map((row) => ({
    ...row,
    trust_weight: trustWeightFromScore(row.user_id ? scoreByUserId.get(row.user_id) : null),
  }));
  const computed = computeSignalFromCheckIns(signalRows);
  const hasCrowdRead = computed.busyness0To100 != null;
  const computedAt = new Date().toISOString();
  const payload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    busyness_0_100: hasCrowdRead ? computed.busyness0To100 : existingSignal?.busyness_0_100,
    busyness_source: hasCrowdRead ? computed.busynessSource : existingSignal?.busyness_source,
    mf_ratio: computed.mfRatio,
    confidence_0_1: computed.confidence0To1,
    sample_size: computed.sampleSize,
    computed_at: computedAt,
    last_busyness_refresh: existingSignal?.last_busyness_refresh ?? venue.last_busyness_refresh,
  };

  const signalRowsResult = (await sql`
    INSERT INTO venue_signals (
      venue_id,
      place_id,
      busyness_0_100,
      busyness_source,
      mf_ratio,
      confidence_0_1,
      sample_size,
      computed_at,
      last_busyness_refresh
    )
    VALUES (
      ${payload.venue_id},
      ${payload.place_id},
      ${payload.busyness_0_100},
      ${payload.busyness_source},
      ${payload.mf_ratio},
      ${payload.confidence_0_1},
      ${payload.sample_size},
      ${payload.computed_at},
      ${payload.last_busyness_refresh}
    )
    ON CONFLICT (venue_id) DO UPDATE SET
      place_id = EXCLUDED.place_id,
      busyness_0_100 = EXCLUDED.busyness_0_100,
      busyness_source = EXCLUDED.busyness_source,
      mf_ratio = EXCLUDED.mf_ratio,
      confidence_0_1 = EXCLUDED.confidence_0_1,
      sample_size = EXCLUDED.sample_size,
      computed_at = EXCLUDED.computed_at,
      last_busyness_refresh = EXCLUDED.last_busyness_refresh
    RETURNING *
  `) as Array<Record<string, unknown>>;

  return signalRowsResult[0];
}

function trustWeightFromScore(score: { trusted_reporter?: boolean; confirmed_checkins?: number } | null | undefined): number {
  if (score?.trusted_reporter) return 1.2;
  if ((score?.confirmed_checkins ?? 0) >= 1) return 1.0;
  return 0.5;
}

async function getScoreByUserId(rows: SignalCheckInRow[]): Promise<Map<string, { trusted_reporter: boolean; confirmed_checkins: number }>> {
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value)))];
  if (userIds.length === 0) return new Map();

  const data = (await sql`
    SELECT user_id, trusted_reporter, confirmed_checkins
    FROM user_scores
    WHERE user_id = ANY(${userIds}::uuid[])
  `) as Array<{ user_id: string; trusted_reporter: boolean; confirmed_checkins: number }>;

  return new Map(
    data.map((score) => [
      score.user_id,
      score,
    ]),
  );
}
