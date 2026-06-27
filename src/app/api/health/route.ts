import { NextResponse, type NextRequest } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { LAUNCH_ZONES } from "@/lib/launchZone";
import { supabaseAdmin } from "@/lib/supabase";

type ZoneSignalCoverage = {
  zone_id: string;
  zone_name: string;
  venues: number;
  with_besttime_venue_id: number;
  without_besttime_venue_id: number;
  with_signal: number;
  without_signal: number;
  lastBusynessRefresh: string | null;
};

type HealthPayload = {
  status: "ok" | "degraded";
  ts: string;
  venue_count: number | null;
  signals_count: number | null;
  openNowCount: number | null;
  zones_with_signal_coverage: Record<string, number>;
  besttime_coverage_by_zone: ZoneSignalCoverage[];
  lastBusynessRefresh: string | null;
  staleSince: string | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

// Busyness signals are populated by the protected daily BestTime cron in
// vercel.json. Keep health aligned to that cache cadence, with grace for
// cron delay/runtime, and degrade only when a full daily refresh is missed.
const BUSYNESS_STALE_AFTER_MS = 30 * 60 * 60 * 1000;

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
  zone_id: string | null;
  besttime_venue_id: string | null;
  open_now: boolean | null;
  venue_signals:
    | { busyness_0_100: number | null; last_busyness_refresh: string | null }
    | Array<{ busyness_0_100: number | null; last_busyness_refresh: string | null }>
    | null;
};

function firstSignal(row: VenueHealthRow): { busyness_0_100: number | null; last_busyness_refresh: string | null } | null {
  if (Array.isArray(row.venue_signals)) return row.venue_signals[0] ?? null;
  return row.venue_signals ?? null;
}

async function getVenueHealthRows(): Promise<VenueHealthRow[] | null> {
  try {
    const query = supabaseAdmin
      .from("venues")
      .select("zone_id, besttime_venue_id, open_now, venue_signals(busyness_0_100, last_busyness_refresh)")
      .in("zone_id", LAUNCH_ZONES.map((zone) => zone.id));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([query, timeout]);

    if (!result || result.error) return null;
    return (result.data ?? []) as VenueHealthRow[];
  } catch {
    return null;
  }
}

function buildZoneSignalCoverage(rows: VenueHealthRow[] | null): {
  zonesWithSignalCoverage: Record<string, number>;
  bestTimeCoverageByZone: ZoneSignalCoverage[];
} {
  const coverageByZone = new Map<string, ZoneSignalCoverage>(
    LAUNCH_ZONES.map((zone) => [
      zone.id,
      {
        zone_id: zone.id,
        zone_name: zone.name,
        venues: 0,
        with_besttime_venue_id: 0,
        without_besttime_venue_id: 0,
        with_signal: 0,
        without_signal: 0,
        lastBusynessRefresh: null,
      },
    ])
  );

  for (const row of rows ?? []) {
    if (!row.zone_id || !coverageByZone.has(row.zone_id)) continue;
    const coverage = coverageByZone.get(row.zone_id)!;
    const signal = firstSignal(row);
    const hasBestTimeVenueId = typeof row.besttime_venue_id === "string" && row.besttime_venue_id.trim().length > 0;
    const hasSignal = typeof signal?.busyness_0_100 === "number";

    coverage.venues += 1;
    if (hasBestTimeVenueId) coverage.with_besttime_venue_id += 1;
    else coverage.without_besttime_venue_id += 1;
    if (hasSignal) coverage.with_signal += 1;
    else coverage.without_signal += 1;

    if (signal?.last_busyness_refresh) {
      const current = coverage.lastBusynessRefresh ? new Date(coverage.lastBusynessRefresh).getTime() : 0;
      const next = new Date(signal.last_busyness_refresh).getTime();
      if (Number.isFinite(next) && next > current) {
        coverage.lastBusynessRefresh = signal.last_busyness_refresh;
      }
    }
  }

  const bestTimeCoverageByZone = [...coverageByZone.values()];
  return {
    zonesWithSignalCoverage: Object.fromEntries(
      bestTimeCoverageByZone.map((coverage) => [coverage.zone_id, coverage.with_signal])
    ),
    bestTimeCoverageByZone,
  };
}

export async function GET(req?: NextRequest) {
  const rate = req ? publicRateLimit(req, "health", 120) : null;
  if (rate?.response) return rate.response;
  const headers = { ...NO_STORE_HEADERS, ...(rate?.headers ?? {}) };

  const [venueCount, signalsCount, venueRows] = await Promise.all([
    countRows("venues"),
    countRows("venue_signals"),
    getVenueHealthRows(),
  ]);

  const openNowCount = venueRows?.filter((row) => row.open_now === true).length ?? null;
  const { zonesWithSignalCoverage, bestTimeCoverageByZone } = buildZoneSignalCoverage(venueRows);
  const refreshTimes = (venueRows ?? [])
    .map((row) => firstSignal(row)?.last_busyness_refresh)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const oldestSignal = refreshTimes[0] ?? null;
  const newestSignal = refreshTimes[refreshTimes.length - 1] ?? null;
  const staleCutoffMs = Date.now() - BUSYNESS_STALE_AFTER_MS;
  const staleSince = oldestSignal && oldestSignal.getTime() < staleCutoffMs ? oldestSignal.toISOString() : null;
  const hasCoverageGap =
    venueCount != null && signalsCount != null && signalsCount < venueCount * 0.8;

  const payload: HealthPayload = {
    status: hasCoverageGap || staleSince ? "degraded" : "ok",
    ts: new Date().toISOString(),
    venue_count: venueCount,
    signals_count: signalsCount,
    openNowCount,
    zones_with_signal_coverage: zonesWithSignalCoverage,
    besttime_coverage_by_zone: bestTimeCoverageByZone,
    lastBusynessRefresh: newestSignal?.toISOString() ?? null,
    staleSince,
  };

  return NextResponse.json(payload, { status: 200, headers });
}
