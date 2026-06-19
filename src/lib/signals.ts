import { supabaseAdmin } from "@/lib/supabase";
import type { CrowdFeel, ReportedBusyness } from "@/types";

const LOOKBACK_MINUTES = 120;
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
  created_at: string;
};

// Maps crowd-reported busyness to a 0-100 score.
// dead=16 (barely alive), moderate=50, packed=84 (very full).
function busynessToScore(busyness: ReportedBusyness): number {
  if (busyness === "dead") return 16;
  if (busyness === "packed") return 84;
  return 50; // moderate
}

// Maps crowd_feel to a 0-100 male-ratio value for the M/F signal.
// mostly_male=100, balanced=50, mixed=50 (neutral), mostly_female=0.
// All four values are valid; no nulls — every check-in contributes.
function crowdFeelToMaleValue(crowdFeel: CrowdFeel): number {
  if (crowdFeel === "mostly_male") return 100;
  if (crowdFeel === "mostly_female") return 0;
  return 50; // balanced or mixed both anchor at 50
}

// Recomputes the M/F and busyness signal from a set of recent check-in rows.
//
// Recency weight: w = 0.5 ^ (age_minutes / 45)  (half-life = 45 minutes)
// M/F ratio:     mf_ratio = Σ(maleValue × w) / Σw  (0-100 scale, 100 = all male)
// Agreement:     how consistently reports lean in one direction
//                  1.0 = unanimous, 0.5 = split, 0.0 = completely opposed
// Confidence:    N_eff / (N_eff + 3) × agreement
// N_eff < 2:     mf_ratio stays null (not enough signal to publish a ratio)
export function computeSignalFromCheckIns(rows: SignalCheckInRow[], nowMs = Date.now()) {
  // N_eff = Σw across all check-ins (used for both busyness and ratio gating)
  let nEff = 0;
  let weightedBusyness = 0;
  let weightedMaleValue = 0;
  // agreement numerator: how far each report departs from neutral (50)
  let agreementNumer = 0;

  for (const row of rows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const w = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);

    nEff += w;
    weightedBusyness += busynessToScore(row.busyness) * w;

    const maleValue = crowdFeelToMaleValue(row.crowd_feel);
    weightedMaleValue += maleValue * w;
    // |maleValue - 50| / 50 scales 0-1; 1.0 = fully male or female, 0 = balanced
    agreementNumer += (Math.abs(maleValue - 50) / 50) * w;
  }

  const busyness0To100 = nEff > 0 ? Math.round(weightedBusyness / nEff) : null;

  // Raw ratio in 0-100 range (% male)
  const rawMfRatio = nEff > 0 ? Math.round(weightedMaleValue / nEff) : null;

  // Only publish ratio when there is enough effective weight
  const mfRatio = nEff >= MIN_NEFF_FOR_RATIO ? rawMfRatio : null;

  // agreement ∈ [0, 1]: 1 means all reports perfectly male or female, 0 means balanced
  const agreement = nEff > 0 ? agreementNumer / nEff : 0;
  const confidence0To1 = nEff > 0 ? (nEff / (nEff + 3)) * agreement : 0;

  return {
    busyness0To100,
    busynessSource: nEff > 0 ? ("crowd" as const) : null,
    mfRatio,
    confidence0To1: Math.max(0, Math.min(1, confidence0To1)),
    // Round to 2 dp so callers get a stable number without floating-point noise
    sampleSize: Math.round(nEff * 100) / 100,
  };
}

export async function recomputeVenueSignal(venueId: string) {
  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id, place_id, busyness_0_100, busyness_source, last_busyness_refresh")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) throw venueError ?? new Error("Venue not found");

  const { data: rows, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, place_id, busyness, crowd_feel, created_at")
    .eq("venue_id", venueId)
    .eq("hidden", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const computed = computeSignalFromCheckIns((rows ?? []) as SignalCheckInRow[]);
  const hasCrowdRead = computed.busyness0To100 != null;
  const computedAt = new Date().toISOString();
  const payload = {
    venue_id: venue.id,
    place_id: venue.place_id,
    busyness_0_100: hasCrowdRead ? computed.busyness0To100 : venue.busyness_0_100,
    busyness_source: hasCrowdRead ? computed.busynessSource : venue.busyness_source,
    mf_ratio: computed.mfRatio,
    confidence_0_1: computed.confidence0To1,
    sample_size: computed.sampleSize,
    computed_at: computedAt,
    last_busyness_refresh: venue.last_busyness_refresh,
  };

  const { data, error: upsertError } = await supabaseAdmin
    .from("venue_signals")
    .upsert(payload, { onConflict: "venue_id" })
    .select()
    .single();

  if (upsertError) throw upsertError;
  return data;
}
