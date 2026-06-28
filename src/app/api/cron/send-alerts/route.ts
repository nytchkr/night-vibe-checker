import { NextRequest, NextResponse } from "next/server";
import "server-only";
import webpush from "web-push";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { logCronRun } from "@/lib/cronHealth";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

type SavedVenueRow = {
  user_id: string;
  venue_id: string;
  alert_threshold: number | null;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function authorize(req: NextRequest): boolean {
  return isAuthorizedCronRequest(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  try {
    assertSupabaseServerEnv();
    webpush.setVapidDetails(
      getRequiredEnv("VAPID_EMAIL"),
      getRequiredEnv("VAPID_PUBLIC_KEY"),
      getRequiredEnv("VAPID_PRIVATE_KEY"),
    );
  } catch (error) {
    const message = error instanceof MissingSupabaseEnvError ? "Server configuration is incomplete." : error instanceof Error ? error.message : "Missing push configuration.";
    await logCronRun({ jobName: "send-alerts", startedAt, error: message });
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: savedRows, error: savedError } = await supabaseAdmin
    .from("saved_venues")
    .select("user_id, venue_id, alert_threshold");

  if (savedError) {
    console.error("[cron send-alerts] saved venue query failed:", savedError);
    await logCronRun({ jobName: "send-alerts", startedAt, error: savedError.message });
    return NextResponse.json({ error: "Could not load saved venues." }, { status: 500 });
  }

  let sent = 0;
  let errors = 0;

  for (const row of (savedRows ?? []) as SavedVenueRow[]) {
    const venue = await getConsumerVenueById(row.venue_id);
    const busyness = venue?.signal?.busyness0To100;
    const threshold = row.alert_threshold ?? 70;
    if (!venue || typeof busyness !== "number" || busyness < threshold) continue;

    const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", row.user_id);

    if (subscriptionError) {
      console.error("[cron send-alerts] subscription query failed:", subscriptionError);
      errors += 1;
      continue;
    }

    for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: "NightVibe Alert",
            body: `${venue.name} is ${Math.round(busyness)}% busy right now`,
            url: `/venues/${encodeURIComponent(venue.id)}`,
          }),
        );
        sent += 1;
      } catch (error) {
        console.error("[cron send-alerts] push send failed:", error);
        errors += 1;
      }
    }
  }

  const runError = errors > 0 ? `${errors} alert send or query error(s)` : null;
  await logCronRun({ jobName: "send-alerts", startedAt, venuesUpdated: sent, error: runError });
  return NextResponse.json({ sent, errors });
}

export const GET = POST;
