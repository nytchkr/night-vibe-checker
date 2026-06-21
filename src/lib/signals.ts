import { supabaseAdmin } from "@/lib/supabase";
import type { CrowdFeel, ReportedBusyness } from "@/types";

export const SIGNAL_LOOKBACK_HOURS = 4;
const LOOKBACK_MINUTES = SIGNAL_LOOKBACK_HOURS * 60;
const HALF_LIFE_MINUTES = 45;
// Minimum effective weight (N_eff = Σw) required before writing mf_ratio.
// Below this threshold mf_ratio stays null so the UI doesn't show spurious data.
const MIN_NEFF_FOR_RATIO = 2;

type SignalCheckInRow = {
  id: string;
  venue_id: string;
  place_id: string;
  busyness: ReportedBusyness;
  crowd_feel: CrowdFeel;
  reporter_gender: "male" | "female" | null;
  gender_self_report?: "m" | "f" | null;
  created_at: string;
};

// Maps crowd-reported busyness to a 0-100 score.
// dead=16 (barely alive), moderate=50, packed=84 (very full).
function busynessToScore(busyness: ReportedBusyness): number {
  if (busyness === "dead") return 16;
  if (busyness === "packed") return 84;
  return 50; // moderate
}

function reporterGenderToMaleValue(
  reporterGender: SignalCheckInRow["reporter_gender"],
  genderSelfReport: SignalCheckInRow["gender_self_report"] = null,
): number | null {
  if (genderSelfReport === "m") return 100;
  if (genderSelfReport === "f") return 0;
  if (reporterGender === "male") return 100;
  if (reporterGender === "female") return 0;
  return null;
}

// Recomputes the M/F and busyness signal from a set of recent check-in rows.
//
// Recency weight: w = 0.5 ^ (age_minutes / 45)  (half-life = 45 minutes)
// M/F ratio:     mf_ratio = Σ(reporterGenderValue × w) / Σw  (0-100 scale, 100 = all male)
// Confidence:    N_eff / (N_eff + 3)
// N_eff < 2:     mf_ratio stays null (not enough signal to publish a ratio)
// sample_size:   raw count of visible check-ins in the last 4 hours, not effective weight
export function computeSignalFromCheckIns(rows: SignalCheckInRow[], nowMs = Date.now()) {
  // N_eff = Σw across all check-ins (used for both busyness and ratio gating)
  let nEff = 0;
  let genderNEff = 0;
  let weightedBusyness = 0;
  let weightedMaleValue = 0;

  const recentRows = rows.filter((row) => {
    const createdAtMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdAtMs)) return false;
    return nowMs - createdAtMs <= LOOKBACK_MINUTES * 60_000;
  });

  for (const row of recentRows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const w = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);

    nEff += w;
    weightedBusyness += busynessToScore(row.busyness) * w;

    const maleValue = reporterGenderToMaleValue(row.reporter_gender, row.gender_self_report);
    if (maleValue != null) {
      genderNEff += w;
      weightedMaleValue += maleValue * w;
    }
  }

  const busyness0To100 = nEff > 0 ? Math.round(weightedBusyness / nEff) : null;

  // Raw ratio in 0-100 range (% male)
  const rawMfRatio = genderNEff > 0 ? weightedMaleValue / genderNEff : null;

  // Only publish ratio when there is enough effective weight
  const mfRatio = genderNEff >= MIN_NEFF_FOR_RATIO ? rawMfRatio : null;

  const confidence0To1 = genderNEff > 0 ? genderNEff / (genderNEff + 3) : 0;

  return {
    busyness0To100,
    busynessSource: nEff > 0 ? ("crowd" as const) : null,
    mfRatio,
    confidence0To1: Math.max(0, Math.min(1, confidence0To1)),
    sampleSize: recentRows.length,
  };
}

export async function recomputeVenueSignal(venueId: string) {
  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, last_busyness_refresh")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) throw venueError ?? new Error("Venue not found");

  const [{ data: rows, error }, { data: existingSignal, error: signalError }] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, place_id, busyness, crowd_feel, reporter_gender, gender_self_report, created_at")
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
