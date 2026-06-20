import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type HealthPayload = {
  status: "ok" | "degraded";
  ts: string;
  venue_count: number | null;
  signals_count: number | null;
  openNowCount: number | null;
  lastBusynessRefresh: string | null;
  staleSince: string | null;
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

type VenueHealthRow = {
  open_now: boolean | null;
  venue_signals:
    | { last_busyness_refresh: string | null }
    | Array<{ last_busyness_refresh: string | null }>
    | null;
};

function firstSignal(row: VenueHealthRow): { last_busyness_refresh: string | null } | null {
  if (Array.isArray(row.venue_signals)) return row.venue_signals[0] ?? null;
  return row.venue_signals ?? null;
}

async function getVenueHealthRows(): Promise<VenueHealthRow[] | null> {
  try {
    const query = supabaseAdmin
      .from("venues")
      .select("open_now, venue_signals(last_busyness_refresh)");
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([query, timeout]);

    if (!result || result.error) return null;
    return (result.data ?? []) as VenueHealthRow[];
  } catch {
    return null;
  }
}

export async function GET() {
  const [venueCount, signalsCount, venueRows] = await Promise.all([
    countRows("venues"),
    countRows("venue_signals"),
    getVenueHealthRows(),
  ]);

  const openNowCount = venueRows?.filter((row) => row.open_now === true).length ?? null;
  const refreshTimes = (venueRows ?? [])
    .map((row) => firstSignal(row)?.last_busyness_refresh)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const oldestSignal = refreshTimes[0] ?? null;
  const newestSignal = refreshTimes[refreshTimes.length - 1] ?? null;
  const staleCutoffMs = Date.now() - 6 * 60 * 60 * 1000;
  const staleSince = oldestSignal && oldestSignal.getTime() < staleCutoffMs ? oldestSignal.toISOString() : null;
  const hasCoverageGap =
    venueCount != null && signalsCount != null && signalsCount < venueCount * 0.8;

  const payload: HealthPayload = {
    status: hasCoverageGap || staleSince ? "degraded" : "ok",
    ts: new Date().toISOString(),
    venue_count: venueCount,
    signals_count: signalsCount,
    openNowCount,
    lastBusynessRefresh: newestSignal?.toISOString() ?? null,
    staleSince,
  };

  return NextResponse.json(payload, { status: 200 });
}
