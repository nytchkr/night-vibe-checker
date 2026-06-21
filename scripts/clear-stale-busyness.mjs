#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const CUTOFF = "2026-06-21T00:00:00Z";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run from the app directory.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date().toISOString();

const { error: signalError, count: signalCount } = await supabase
  .from("venue_signals")
  .update(
    {
      busyness_0_100: null,
      busyness_source: null,
      last_busyness_refresh: now,
      computed_at: now,
    },
    { count: "exact" }
  )
  .lt("last_busyness_refresh", CUTOFF);

if (signalError) {
  console.error("Failed to clear stale venue_signals:", signalError);
  process.exit(1);
}

const { error: venueError, count: venueCount } = await supabase
  .from("venues")
  .update(
    {
      besttime_venue_id: null,
      last_busyness_refresh: now,
    },
    { count: "exact" }
  )
  .lt("last_busyness_refresh", CUTOFF);

if (venueError) {
  console.error("Failed to clear stale venues:", venueError);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      cutoff: CUTOFF,
      refreshedAt: now,
      venueSignalsUpdated: signalCount ?? 0,
      venuesUpdated: venueCount ?? 0,
    },
    null,
    2
  )
);
