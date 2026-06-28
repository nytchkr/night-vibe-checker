import { NextRequest, NextResponse } from "next/server";
import "server-only";
import webpush from "web-push";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import { errorMessage, logCronRun } from "@/lib/cronHealth";
import {
  assertSupabaseServerEnv,
  MissingSupabaseEnvError,
  supabaseAdmin,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUSY_THRESHOLD = 70;
const RECENT_NOTIFICATION_WINDOW_MS = 4 * 60 * 60 * 1000;
const NOTIFICATION_TYPE = "busy_venue";

type BusyVenueRow = {
  id: string;
  name: string | null;
  current_popularity: number | null;
};

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

function configureWebPush(): void {
  webpush.setVapidDetails(
    getRequiredEnv("VAPID_EMAIL"),
    getRequiredEnv("VAPID_PUBLIC_KEY"),
    getRequiredEnv("VAPID_PRIVATE_KEY"),
  );
}

function notificationPayload(venue: BusyVenueRow) {
  const busyness = Math.round(venue.current_popularity ?? BUSY_THRESHOLD);
  const name = venue.name?.trim() || "A saved venue";

  return JSON.stringify({
    title: "NightVibe Alert",
    body: `${name} is ${busyness}% busy right now`,
    url: `/venues/${encodeURIComponent(venue.id)}`,
    venueId: venue.id,
    type: NOTIFICATION_TYPE,
  });
}

async function hasRecentNotification(
  userId: string,
  venueId: string,
  cutoffIso: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notifications_sent")
    .select("id")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .eq("notification_type", NOTIFICATION_TYPE)
    .gte("sent_at", cutoffIso)
    .limit(1);

  if (error)
    throw new Error(`notifications_sent query failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function recordNotification(
  userId: string,
  venueId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications_sent").insert({
    user_id: userId,
    venue_id: venueId,
    notification_type: NOTIFICATION_TYPE,
    sent_at: new Date().toISOString(),
  });

  if (error)
    throw new Error(`notifications_sent insert failed: ${error.message}`);
}

async function deleteExpiredSubscription(endpoint: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error)
    console.error(
      "[cron/notify-busy-venues] expired subscription cleanup failed:",
      error,
    );
}

function isGonePushError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 410
  );
}

async function sendPushes(
  venue: BusyVenueRow,
  userId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);

  if (error)
    throw new Error(`push_subscriptions query failed: ${error.message}`);

  let sent = 0;
  for (const subscription of (data ?? []) as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        notificationPayload(venue),
      );
      sent += 1;
    } catch (error) {
      if (isGonePushError(error))
        await deleteExpiredSubscription(subscription.endpoint);
      console.error("[cron/notify-busy-venues] push send failed:", error);
    }
  }

  return sent;
}

async function savedUsersForVenue(
  venue: BusyVenueRow,
): Promise<SavedVenueRow[]> {
  const { data, error } = await supabaseAdmin
    .from("saved_venues")
    .select("user_id, venue_id, alert_threshold")
    .eq("venue_id", venue.id);

  if (error) throw new Error(`saved_venues query failed: ${error.message}`);

  const busyness = venue.current_popularity ?? 0;
  return ((data ?? []) as SavedVenueRow[]).filter(
    (row) => busyness >= (row.alert_threshold ?? BUSY_THRESHOLD),
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    assertSupabaseServerEnv();
    configureWebPush();
  } catch (error) {
    const message =
      error instanceof MissingSupabaseEnvError
        ? "Server configuration is incomplete."
        : error instanceof Error
          ? error.message
          : "Missing push configuration.";
    await logCronRun({
      jobName: "notify-busy-venues",
      startedAt,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: venues, error: venuesError } = await supabaseAdmin
    .from("venues")
    .select("id,name,current_popularity")
    .gte("current_popularity", BUSY_THRESHOLD)
    .eq("hidden", false);

  if (venuesError) {
    console.error(
      "[cron/notify-busy-venues] venues query failed:",
      venuesError,
    );
    await logCronRun({
      jobName: "notify-busy-venues",
      startedAt,
      error: venuesError.message,
    });
    return NextResponse.json(
      { error: "Could not load busy venues." },
      { status: 500 },
    );
  }

  const cutoffIso = new Date(
    Date.now() - RECENT_NOTIFICATION_WINDOW_MS,
  ).toISOString();
  let notified = 0;
  let pushSent = 0;
  let skippedRecent = 0;
  let skippedNoSubscription = 0;
  let errors = 0;

  for (const venue of (venues ?? []) as BusyVenueRow[]) {
    let savedRows: SavedVenueRow[];
    try {
      savedRows = await savedUsersForVenue(venue);
    } catch (error) {
      console.error(
        "[cron/notify-busy-venues] saved venue lookup failed:",
        error,
      );
      errors += 1;
      continue;
    }

    for (const saved of savedRows) {
      try {
        if (await hasRecentNotification(saved.user_id, venue.id, cutoffIso)) {
          skippedRecent += 1;
          continue;
        }

        const sentForUser = await sendPushes(venue, saved.user_id);
        if (sentForUser === 0) {
          skippedNoSubscription += 1;
          continue;
        }

        await recordNotification(saved.user_id, venue.id);
        notified += 1;
        pushSent += sentForUser;
      } catch (error) {
        console.error(
          "[cron/notify-busy-venues] notification processing failed:",
          error,
        );
        errors += 1;
      }
    }
  }

  const runError =
    errors > 0 ? `${errors} notification processing error(s)` : null;
  await logCronRun({
    jobName: "notify-busy-venues",
    startedAt,
    venuesUpdated: notified,
    error: runError,
  });

  return NextResponse.json({
    notified,
    pushSent,
    skippedRecent,
    skippedNoSubscription,
    errors,
  });
}

export const POST = GET;
