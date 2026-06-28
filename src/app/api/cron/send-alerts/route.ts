import { NextRequest, NextResponse } from "next/server";
import "server-only";
import webpush from "web-push";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import { logCronRun } from "@/lib/cronHealth";
import { sql } from "@/lib/db";
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
    webpush.setVapidDetails(
      getRequiredEnv("VAPID_EMAIL"),
      getRequiredEnv("VAPID_PUBLIC_KEY"),
      getRequiredEnv("VAPID_PRIVATE_KEY"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing push configuration.";
    await logCronRun({ jobName: "send-alerts", startedAt, error: message });
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const savedRows = await sql`
    SELECT user_id, venue_id, alert_threshold
    FROM saved_venues
  `;

  let sent = 0;
  let errors = 0;

  for (const row of savedRows as SavedVenueRow[]) {
    const venue = await getConsumerVenueById(row.venue_id);
    const busyness = venue?.signal?.busyness0To100;
    const threshold = row.alert_threshold ?? 70;
    if (!venue || typeof busyness !== "number" || busyness < threshold) continue;

    const subscriptions = await sql`
      SELECT endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE user_id = ${row.user_id}
    `;

    for (const subscription of subscriptions as PushSubscriptionRow[]) {
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
            title: "nytchkr Alert",
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
