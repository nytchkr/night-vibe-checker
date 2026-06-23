import { supabaseAdmin } from "@/lib/supabase";
import type { CrowdFeel, ReportedBusyness } from "@/types";

export const SIGNAL_LOOKBACK_HOURS = 4;
export const MF_RATIO_LOOKBACK_DAYS = 7;
const BUSYNESS_LOOKBACK_MINUTES = SIGNAL_LOOKBACK_HOURS * 60;
const MF_RATIO_LOOKBACK_MINUTES = MF_RATIO_LOOKBACK_DAYS * 24 * 60;
const HALF_LIFE_MINUTES = 45;
const MIN_GENDERED_REPORTS_FOR_RATIO = 5;

type SignalCheckInRow = {
  id: string;
  venue_id: string;
  place_id: string;
  busyness: ReportedBusyness;
  crowd_feel: CrowdFeel;
  gender?: "M" | "F" | "prefer_not" | null;
  reporter_gender: "male" | "female" | null;
  gender_self_report?: "m" | "f" | "nb" | null;
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
// gendered_count < 5: mf_ratio stays null (not enough signal to publish a ratio)
// sample_size:   M+F self-reported check-ins in the last 7 days
export function computeSignalFromCheckIns(rows: SignalCheckInRow[], nowMs = Date.now()) {
  let nEff = 0;
  let weightedBusyness = 0;
  let genderedCount = 0;
  let maleCount = 0;

  const busynessRows = rows.filter((row) => {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) return false;
    return nowMs - createdAtMs <= BUSYNESS_LOOKBACK_MINUTES * 60_000;
  });

  for (const row of busynessRows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const w = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);

    nEff += w;
    weightedBusyness += busynessToScore(row.busyness) * w;
  }

  for (const row of rows) {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > MF_RATIO_LOOKBACK_MINUTES * 60_000) continue;

    const selfReport = rowToBinaryGender(row.gender, row.reporter_gender, row.gender_self_report);
    if (selfReport != null) {
      genderedCount += 1;
      if (selfReport === "m") maleCount += 1;
    }
  }

  const busyness0To100 = nEff > 0 ? Math.round(weightedBusyness / nEff) : null;
  const mfRatio = genderedCount >= MIN_GENDERED_REPORTS_FOR_RATIO ? (maleCount / genderedCount) * 100 : null;
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

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, last_busyness_refresh")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) throw venueError ?? new Error("Venue not found");

  const [{ data: rows, error }, { data: existingSignal, error: signalError }] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, place_id, busyness, crowd_feel, gender, reporter_gender, gender_self_report, created_at")
      .eq("venue_id", venueId)
      .eq("hidden", false)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("venue_signals")
      .select("busyness_0_100, busyness_source, last_busyness_refresh")
      .eq("venue_id", venueId)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (signalError) throw signalError;

  const computed = computeSignalFromCheckIns((rows ?? []) as SignalCheckInRow[]);
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

  const { data, error: upsertError } = await supabaseAdmin
    .from("venue_signals")
    .upsert(payload, { onConflict: "venue_id" })
    .select()
    .single();

  if (upsertError) throw upsertError;
  return data;
}
