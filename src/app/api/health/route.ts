import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type HealthPayload = {
  status: "ok";
  ts: string;
  venue_count: number | null;
  signals_count: number | null;
};

async function countRows(table: "venues" | "venue_signals"): Promise<number | null> {
  try {
    const query = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([query, timeout]);

    if (!result || result.error) return null;
    return result.count ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [venueCount, signalsCount] = await Promise.all([
    countRows("venues"),
    countRows("venue_signals"),
  ]);

  const payload: HealthPayload = {
    status: "ok",
    ts: new Date().toISOString(),
    venue_count: venueCount,
    signals_count: signalsCount,
  };

  return NextResponse.json(payload, { status: 200 });
}
