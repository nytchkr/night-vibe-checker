import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { ArrowLeft } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { NotificationsClient, type AlertVenue, type NotificationPrefs } from "./NotificationsClient";

export const dynamic = "force-dynamic";

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: false,
  savedVenueBusy: true,
  subscribedVenueAlerts: true,
  friendCheckIns: false,
};

function normalizePrefs(value: unknown, hasPushSubscription: boolean): NotificationPrefs {
  const raw = value && typeof value === "object" ? value as Partial<NotificationPrefs> : {};

  return {
    pushEnabled: typeof raw.pushEnabled === "boolean" ? raw.pushEnabled : hasPushSubscription,
    savedVenueBusy: typeof raw.savedVenueBusy === "boolean" ? raw.savedVenueBusy : DEFAULT_PREFS.savedVenueBusy,
    subscribedVenueAlerts:
      typeof raw.subscribedVenueAlerts === "boolean" ? raw.subscribedVenueAlerts : DEFAULT_PREFS.subscribedVenueAlerts,
    friendCheckIns: typeof raw.friendCheckIns === "boolean" ? raw.friendCheckIns : DEFAULT_PREFS.friendCheckIns,
  };
}

async function loadAlertVenues(userId: string): Promise<AlertVenue[]> {
  const { data: alertRows } = await supabaseAdmin
    .from("push_venue_alerts")
    .select("venue_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const venueIds = ((alertRows ?? []) as Array<{ venue_id: string | null }>)
    .map((row) => row.venue_id)
    .filter((id): id is string => Boolean(id));

  if (venueIds.length === 0) return [];

  const { data: venues } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .in("id", venueIds);

  const venueNames = new Map(
    ((venues ?? []) as Array<{ id: string; name: string }>).map((venue) => [venue.id, venue.name]),
  );

  return venueIds.map((id) => ({ id, name: venueNames.get(id) ?? "Venue alert" }));
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

  const [profileResult, pushResult, alertVenues] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", session.user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1),
    loadAlertVenues(session.user.id),
  ]);

  const hasPushSubscription = Boolean(pushResult.data?.length);
  const initialPrefs = normalizePrefs(
    (profileResult.data as { notification_prefs?: unknown } | null)?.notification_prefs,
    hasPushSubscription,
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
          <p className="mt-2 text-sm font-semibold text-white/45">Control your <span className="font-display">NightVibe</span> alerts</p>
        </header>

        <NotificationsClient initialPrefs={initialPrefs} initialAlertVenues={alertVenues} />
      </div>
    </main>
  );
}
