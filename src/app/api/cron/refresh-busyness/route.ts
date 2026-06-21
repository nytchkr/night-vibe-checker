// Required server env vars: CRON_SECRET, BESTTIME_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type VenueRow = {
  id: string;
  besttime_venue_id: string | null;
  name: string;
};

type RefreshError = {
  venueId: string;
  bestTimeVenueId?: string;
  name?: string;
  error: string;
};

const BESTTIME_LIVE_URL = "https://besttime.app/api/v1/forecasts/live/raw";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

function readPath(payload: unknown, path: string[]): unknown {
  return path.reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

function firstNumber(payload: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function extractBusynessPct(payload: unknown): number | null {
  const value = firstNumber(payload, [
    ["analysis", "venue_live_busyness"],
    ["analysis", "venue_live_forecasted_busyness"],
    ["analysis", "venue_forecasted_busyness"],
    ["venue_live_busyness"],
    ["venue_live_forecasted_busyness"],
    ["venue_forecasted_busyness"],
    ["busyness"],
    ["busyness_pct"],
  ]);

  if (value == null) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasLiveBusyness(payload: unknown): boolean {
  const available = readPath(payload, ["analysis", "venue_live_busyness_available"]);
  return available === true;
}

async function fetchBestTimeLive(bestTimeVenueId: string, apiKey: string): Promise<{ busynessPct: number }> {
  const url = new URL(BESTTIME_LIVE_URL);
  url.searchParams.set("api_key_private", apiKey);
  url.searchParams.set("venue_id", bestTimeVenueId);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`BestTime HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!hasLiveBusyness(payload)) {
    throw new Error("BestTime live busyness is not available for this venue.");
  }

  const busynessPct = extractBusynessPct(payload);
  if (busynessPct == null) {
    throw new Error("BestTime response did not include live busyness.");
  }

  return { busynessPct };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.BESTTIME_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing BESTTIME_API_KEY server environment variable." },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, besttime_venue_id, name")
    .not("besttime_venue_id", "is", null)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const errors: RefreshError[] = [];
  let updated = 0;

  for (const venue of (data ?? []) as VenueRow[]) {
    if (!venue.besttime_venue_id) continue;

    try {
      const live = await fetchBestTimeLive(venue.besttime_venue_id, apiKey);
      const { error: updateError } = await supabaseAdmin
        .from("venues")
        .update({
          busyness_pct: live.busynessPct,
          last_busyness_refresh: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", venue.id);

      if (updateError) {
        console.warn(`Failed to update busyness for ${venue.name} (${venue.id}): ${updateError.message}`);
        errors.push({
          venueId: venue.id,
          bestTimeVenueId: venue.besttime_venue_id,
          name: venue.name,
          error: updateError.message,
        });
        continue;
      }

      updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown BestTime error";
      console.warn(`Failed to refresh BestTime busyness for ${venue.name} (${venue.id}): ${message}`);
      errors.push({
        venueId: venue.id,
        bestTimeVenueId: venue.besttime_venue_id,
        name: venue.name,
        error: message,
      });
    }
  }

  return NextResponse.json({ updated, errors });
}

export const POST = GET;
