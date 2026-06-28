import { sql } from "@/lib/db";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";

export const MF_RATIO_LOOKBACK_HOURS = 24;

type CheckInGenderRow = {
  id?: string;
  gender?: string | null;
  reporter_gender?: string | null;
  gender_self_report?: string | null;
  created_at?: string | null;
};

export type ComputedMfRatio = {
  mfRatio: number | null;
  sampleSize: number;
  computedAt: string;
};

function normalizeBinaryGender(row: CheckInGenderRow): "m" | "f" | null {
  const selfReport = row.gender_self_report?.toLowerCase();
  if (selfReport === "m" || selfReport === "male" || selfReport === "man") return "m";
  if (selfReport === "f" || selfReport === "female" || selfReport === "woman") return "f";

  const canonical = row.gender?.toLowerCase();
  if (canonical === "m" || canonical === "male" || canonical === "man") return "m";
  if (canonical === "f" || canonical === "female" || canonical === "woman") return "f";

  const profileGender = row.reporter_gender?.toLowerCase();
  if (profileGender === "male" || profileGender === "man") return "m";
  if (profileGender === "female" || profileGender === "woman") return "f";

  return null;
}

export function computeMfRatioFromCheckIns(
  rows: CheckInGenderRow[],
  nowMs = Date.now()
): ComputedMfRatio {
  const cutoffMs = nowMs - MF_RATIO_LOOKBACK_HOURS * 60 * 60_000;
  let maleCount = 0;
  let genderedCount = 0;

  for (const row of rows) {
    const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
    if (!Number.isFinite(createdAtMs) || createdAtMs < cutoffMs) continue;

    const gender = normalizeBinaryGender(row);
    if (!gender) continue;

    genderedCount += 1;
    if (gender === "m") maleCount += 1;
  }

  return {
    mfRatio: genderedCount >= MIN_SAMPLE_SIZE_FOR_RATIO ? (maleCount / genderedCount) * 100 : null,
    sampleSize: genderedCount,
    computedAt: new Date(nowMs).toISOString(),
  };
}

export async function computeVenueMfRatioFromCheckIns(
  venueId: string,
  nowMs = Date.now()
): Promise<ComputedMfRatio> {
  const cutoff = new Date(nowMs - MF_RATIO_LOOKBACK_HOURS * 60 * 60_000).toISOString();
  const rows = await sql`
    SELECT id, gender, reporter_gender, gender_self_report, created_at
    FROM check_ins
    WHERE venue_id = ${venueId}
      AND hidden = false
      AND created_at >= ${cutoff}
    ORDER BY created_at DESC
  `;

  return computeMfRatioFromCheckIns(rows as CheckInGenderRow[], nowMs);
}
