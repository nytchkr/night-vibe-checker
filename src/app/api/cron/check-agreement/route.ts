import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import { supabaseAdmin } from "@/lib/supabase";
import { incrementConfirmedCheckins, updateUserScore } from "@/lib/rewards";

export const dynamic = "force-dynamic";

type AgreementCheckIn = {
  id: string;
  user_id: string;
  venue_id: string;
  busyness: "dead" | "moderate" | "packed" | null;
  crowd_feel: string | null;
  created_at: string;
};

async function checkAgreement(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const earliest = new Date(now - 90 * 60_000).toISOString();
  const latest = new Date(now - 30 * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, user_id, venue_id, busyness, crowd_feel, created_at")
    .not("user_id", "is", null)
    .eq("agreement_bonus_applied", false)
    .gte("created_at", earliest)
    .lte("created_at", latest)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[cron/check-agreement] eligible lookup failed:", error);
    return NextResponse.json({ error: "Agreement check failed." }, { status: 500 });
  }

  let agreementBonuses = 0;
  let penalties = 0;
  let processed = 0;
  const errors: Array<{ checkinId: string; error: string }> = [];

  for (const checkIn of (data ?? []) as AgreementCheckIn[]) {
    try {
      const result = await processCheckIn(checkIn);
      if (result.processed) processed += 1;
      if (result.agreementBonus) agreementBonuses += 1;
      if (result.penalty) penalties += 1;
    } catch (err) {
      console.error("[cron/check-agreement] check-in failed:", checkIn.id, err);
      errors.push({ checkinId: checkIn.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({
    checked: data?.length ?? 0,
    processed,
    agreementBonuses,
    penalties,
    errors,
  });
}

async function processCheckIn(checkIn: AgreementCheckIn): Promise<{ processed: boolean; agreementBonus: boolean; penalty: boolean }> {
  const createdAtMs = new Date(checkIn.created_at).getTime();
  if (!Number.isFinite(createdAtMs) || !checkIn.busyness) return { processed: false, agreementBonus: false, penalty: false };

  const agreementPeers = await getAgreementPeers(checkIn, createdAtMs);
  const hasAgreement = agreementPeers.some((peer) => isAgreement(checkIn, peer));

  if (hasAgreement) {
    await incrementConfirmedCheckins(checkIn.user_id);
    await updateUserScore(checkIn.user_id, 10, "agreement_bonus", "Other reports agreed with this check-in", checkIn.id);
    await markAgreementProcessed(checkIn.id);
    return { processed: true, agreementBonus: true, penalty: false };
  }

  const penaltyPeers = await getPenaltyPeers(checkIn, createdAtMs);
  if (penaltyPeers.length >= 3 && stronglyDisagrees(checkIn, penaltyPeers)) {
    const alreadyPenalized = await hasPointsEvent(checkIn.id, "penalty");
    if (!alreadyPenalized) {
      await updateUserScore(checkIn.user_id, -15, "penalty", "Multiple independent reports strongly disagreed", checkIn.id);
    }
    await markAgreementProcessed(checkIn.id);
    return { processed: true, agreementBonus: false, penalty: !alreadyPenalized };
  }

  return { processed: false, agreementBonus: false, penalty: false };
}

async function getAgreementPeers(checkIn: AgreementCheckIn, createdAtMs: number): Promise<AgreementCheckIn[]> {
  const start = new Date(createdAtMs - 30 * 60_000).toISOString();
  const end = new Date(createdAtMs + 30 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, user_id, venue_id, busyness, crowd_feel, created_at")
    .eq("venue_id", checkIn.venue_id)
    .neq("user_id", checkIn.user_id)
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("hidden", false);

  if (error) throw error;
  return (data ?? []) as AgreementCheckIn[];
}

async function getPenaltyPeers(checkIn: AgreementCheckIn, createdAtMs: number): Promise<AgreementCheckIn[]> {
  const end = new Date(createdAtMs + 60 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, user_id, venue_id, busyness, crowd_feel, created_at")
    .eq("venue_id", checkIn.venue_id)
    .neq("user_id", checkIn.user_id)
    .gte("created_at", checkIn.created_at)
    .lte("created_at", end)
    .eq("hidden", false);

  if (error) throw error;
  const byUser = new Map<string, AgreementCheckIn>();
  for (const peer of (data ?? []) as AgreementCheckIn[]) {
    if (peer.user_id && !byUser.has(peer.user_id)) byUser.set(peer.user_id, peer);
  }
  return [...byUser.values()];
}

function isAgreement(checkIn: AgreementCheckIn, peer: AgreementCheckIn): boolean {
  if (!checkIn.busyness || !peer.busyness) return false;
  return withinOneStep(busynessStep(checkIn.busyness), busynessStep(peer.busyness)) && crowdFeelWithinOneStep(checkIn.crowd_feel, peer.crowd_feel);
}

function stronglyDisagrees(checkIn: AgreementCheckIn, peers: AgreementCheckIn[]): boolean {
  if (!checkIn.busyness) return false;
  const peerScores = peers.map((peer) => peer.busyness).filter((value): value is "dead" | "moderate" | "packed" => Boolean(value)).map(busynessScore);
  if (peerScores.length < 3) return false;
  const average = peerScores.reduce((sum, score) => sum + score, 0) / peerScores.length;
  return Math.abs(average - busynessScore(checkIn.busyness)) > 40;
}

function busynessStep(value: "dead" | "moderate" | "packed"): number {
  if (value === "dead") return 0;
  if (value === "moderate") return 1;
  return 2;
}

function busynessScore(value: "dead" | "moderate" | "packed"): number {
  if (value === "dead") return 16;
  if (value === "packed") return 84;
  return 50;
}

function crowdFeelWithinOneStep(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  if (left === right) return true;

  const energyOrder = ["dead", "chill", "mixed", "hyped", "packed"];
  const genderOrder = ["mostly_male", "balanced", "mostly_female"];
  const order = energyOrder.includes(left) && energyOrder.includes(right) ? energyOrder : genderOrder;
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  return leftIndex >= 0 && rightIndex >= 0 && withinOneStep(leftIndex, rightIndex);
}

function withinOneStep(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}

async function hasPointsEvent(checkinId: string, eventType: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("points_events")
    .select("id", { count: "exact", head: true })
    .eq("checkin_id", checkinId)
    .eq("event_type", eventType);

  if (error) throw error;
  return (count ?? 0) > 0;
}

async function markAgreementProcessed(checkinId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("check_ins")
    .update({ agreement_bonus_applied: true })
    .eq("id", checkinId);

  if (error) throw error;
}

export const GET = checkAgreement;
export const POST = checkAgreement;
