import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { ArrowLeft } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { NotificationsClient, type NotificationPrefs } from "./NotificationsClient";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS: NotificationPrefs = {
  notifyBusyVenues: true,
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
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.user.id) {
    redirect(`/login?return=${encodeURIComponent("/notifications")}`);
  }

  const { data: prefsRow } = await supabaseAdmin
    .from("user_preferences")
    .select("notify_busy_venues, notify_weekly_summary")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const initialPrefs = normalizePrefs(
    prefsRow
      ? {
          notifyBusyVenues: (prefsRow as { notify_busy_venues?: unknown }).notify_busy_venues,
          notifyWeeklySummary: (prefsRow as { notify_weekly_summary?: unknown }).notify_weekly_summary,
        }
      : null,
  );

  return (
    <main className="min-h-screen bg-[#0A0A0E] text-white">
      <div className="mx-auto max-w-lg px-4 pb-36 pt-5">
        <Link
          href="/profile"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-bold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <ArrowLeft size={16} />
          Back to profile
        </Link>

        <header className="mt-7 mb-8">
          <h1 className="font-display text-3xl font-black tracking-tight text-white">Notifications</h1>
          <p className="mt-2 text-sm font-semibold text-white/45">
            Choose when <span className="font-display">NightVibe</span> should reach you.
          </p>
        </header>

        <NotificationsClient initialPrefs={initialPrefs} />
      </div>
    </main>
  );
}
