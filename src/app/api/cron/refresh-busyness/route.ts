// Required server env vars: CRON_SECRET, BESTTIME_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type VenueRow = {
  id: string;
  place_id: string | null;
  name: string;
};

type RefreshError = {
  venueId: string;
  placeId?: string;
  name?: string;
  error: string;
};

type CrowdFeel = "male" | "female" | "balanced";

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

function extractCrowdFeel(payload: unknown): CrowdFeel {
  const malePct = firstNumber(payload, [
    ["analysis", "male_pct"],
    ["analysis", "male_percentage"],
    ["analysis", "male"],
    ["male_pct"],
    ["male_percentage"],
    ["male"],
  ]);
  const femalePct = firstNumber(payload, [
    ["analysis", "female_pct"],
    ["analysis", "female_percentage"],
    ["analysis", "female"],
    ["female_pct"],
    ["female_percentage"],
    ["female"],
  ]);

  if (malePct != null && femalePct != null) {
    if (malePct - femalePct >= 15) return "male";
    if (femalePct - malePct >= 15) return "female";
  } else if (malePct != null) {
    if (malePct >= 58) return "male";
    if (malePct <= 42) return "female";
  } else if (femalePct != null) {
    if (femalePct >= 58) return "female";
    if (femalePct <= 42) return "male";
  }

  const rawFeel = readPath(payload, ["analysis", "crowd_feel"]) ?? readPath(payload, ["crowd_feel"]);
  if (typeof rawFeel === "string") {
    const normalized = rawFeel.toLowerCase();
    if (normalized.includes("female")) return "female";
    if (normalized.includes("male")) return "male";
  }

  return "balanced";
}

async function fetchBestTimeLive(placeId: string, apiKey: string): Promise<{ busynessPct: number; crowdFeel: CrowdFeel }> {
  const url = new URL(BESTTIME_LIVE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("venue_id", placeId);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`BestTime HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const busynessPct = extractBusynessPct(payload);
  if (busynessPct == null) {
    throw new Error("BestTime response did not include live busyness.");
  }

  return {
    busynessPct,
    crowdFeel: extractCrowdFeel(payload),
  };
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
    .select("id, place_id, name")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const errors: RefreshError[] = [];
  let updated = 0;

  for (const venue of (data ?? []) as VenueRow[]) {
    if (!venue.place_id) continue;

    try {
      const live = await fetchBestTimeLive(venue.place_id, apiKey);
      const { error: updateError } = await supabaseAdmin
        .from("venues")
        .update({
          busyness_pct: live.busynessPct,
          crowd_feel: live.crowdFeel,
          updated_at: new Date().toISOString(),
        })
        .eq("id", venue.id);

      if (updateError) {
        errors.push({
          venueId: venue.id,
          placeId: venue.place_id,
          name: venue.name,
          error: updateError.message,
        });
        continue;
      }

      updated += 1;
    } catch (err) {
      errors.push({
        venueId: venue.id,
        placeId: venue.place_id,
        name: venue.name,
        error: err instanceof Error ? err.message : "Unknown BestTime error",
      });
    }
  }

  return NextResponse.json({ updated, errors });
}

export const POST = GET;
