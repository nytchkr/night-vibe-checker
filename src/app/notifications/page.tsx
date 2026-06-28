import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { NotificationsClient, type NotificationPrefs } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications — nytchkr",
  description: "Manage nytchkr venue alerts and nightlife notification settings.",
  alternates: {
    canonical: "/notifications",
  },
  robots: {
    index: false,
    follow: false,
  },
};

const DEFAULT_PREFS: NotificationPrefs = {
  notifyBusyVenues: false,
  notifyWeeklySummary: false,
};

function normalizePrefs(value: unknown): NotificationPrefs {
  const raw = value && typeof value === "object" ? value as Partial<NotificationPrefs> : {};

  return {
    notifyBusyVenues:
      typeof raw.notifyBusyVenues === "boolean" ? raw.notifyBusyVenues : DEFAULT_PREFS.notifyBusyVenues,
    notifyWeeklySummary:
      typeof raw.notifyWeeklySummary === "boolean" ? raw.notifyWeeklySummary : DEFAULT_PREFS.notifyWeeklySummary,
  };
}

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user.id) {
    redirect(`/sign-in?return=${encodeURIComponent("/notifications")}`);
  }

  const rows = (await sql`
    SELECT notify_busy_venues, notify_weekly_summary
    FROM user_preferences
    WHERE user_id = ${session.user.id}
    LIMIT 1
  `) as Array<{ notify_busy_venues?: unknown; notify_weekly_summary?: unknown }>;
  const prefsRow = rows[0] ?? null;

  const initialPrefs = normalizePrefs(
    prefsRow
      ? {
          notifyBusyVenues: (prefsRow as { notify_busy_venues?: unknown }).notify_busy_venues,
          notifyWeeklySummary: (prefsRow as { notify_weekly_summary?: unknown }).notify_weekly_summary,
        }
      : null,
  );

  return (
    <main className="min-h-screen-safe bg-[#0A0A0E] text-white">
      <div className="mx-auto max-w-lg px-4 pb-36 pt-5">
        <Link
          href="/profile"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-bold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <ArrowLeft size={16} />
          Back to You
        </Link>

        <header className="mt-7 mb-8">
          <h1 className="font-display text-3xl font-black tracking-tight text-white">Notifications</h1>
          <p className="mt-2 text-sm font-semibold text-white/45">
            Choose when <span className="font-display">nytchkr</span> should reach you.
          </p>
        </header>

        <NotificationsClient initialPrefs={initialPrefs} />
      </div>
    </main>
  );
}
