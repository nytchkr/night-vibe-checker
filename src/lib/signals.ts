import { supabaseAdmin } from "@/lib/supabase";
import type { CrowdFeel, ReportedBusyness } from "@/types";

const LOOKBACK_MINUTES = 120;
const HALF_LIFE_MINUTES = 45;
const MIN_EFFECTIVE_REPORTS_FOR_RATIO = 2;

type SignalCheckInRow = {
  id: string;
  venue_id: string;
  place_id: string;
  busyness: ReportedBusyness;
  crowd_feel: CrowdFeel;
  created_at: string;
};

function busynessToScore(busyness: ReportedBusyness): number {
  if (busyness === "dead") return 20;
  if (busyness === "packed") return 90;
  return 55;
}

function crowdFeelToMaleRatio(crowdFeel: CrowdFeel): number | null {
  if (crowdFeel === "mostly_male") return 0.8;
  if (crowdFeel === "mostly_female") return 0.2;
  if (crowdFeel === "balanced") return 0.5;
  return null;
}

export function computeSignalFromCheckIns(rows: SignalCheckInRow[], nowMs = Date.now()) {
  let effectiveWeight = 0;
  let weightedBusyness = 0;
  let ratioWeight = 0;
  let weightedMaleRatio = 0;
  let agreementWeight = 0;

  for (const row of rows) {
    const ageMinutes = Math.max(0, (nowMs - new Date(row.created_at).getTime()) / 60_000);
    const weight = Math.pow(0.5, ageMinutes / HALF_LIFE_MINUTES);
    effectiveWeight += weight;
    weightedBusyness += busynessToScore(row.busyness) * weight;

    const maleRatio = crowdFeelToMaleRatio(row.crowd_feel);
    if (maleRatio == null) continue;

    ratioWeight += weight;
    weightedMaleRatio += maleRatio * weight;
    agreementWeight += Math.abs(maleRatio - 0.5) * 2 * weight;
  }

  const busyness0To100 =
    effectiveWeight > 0 ? Math.round(weightedBusyness / effectiveWeight) : null;
  const rawMfRatio = ratioWeight > 0 ? Math.round((weightedMaleRatio / ratioWeight) * 100) : null;
  const mfRatio = ratioWeight >= MIN_EFFECTIVE_REPORTS_FOR_RATIO ? rawMfRatio : null;
  const agreement = ratioWeight > 0 ? agreementWeight / ratioWeight : 0;
  const confidence0To1 =
    effectiveWeight > 0 ? (effectiveWeight / (effectiveWeight + 3)) * agreement : 0;

  return {
    busyness0To100,
    busynessSource: effectiveWeight > 0 ? ("crowd" as const) : null,
    mfRatio,
    confidence0To1: Math.max(0, Math.min(1, confidence0To1)),
    sampleSize: Math.round(effectiveWeight * 100) / 100,
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
