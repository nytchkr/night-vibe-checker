import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, getAdminCookieToken } from "@/lib/adminPasswordAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { BusiestVenueRows, RecentCheckInRows } from "@/components/admin/AdminDashboardModeration";

export const dynamic = "force-dynamic";

type VenueRef = {
  id: string;
  name: string;
};

type CheckInRow = {
  id: string;
  venue_id: string;
  user_id: string | null;
  created_at: string;
  venues: VenueRef | VenueRef[] | null;
};

type RecentCheckIn = {
  id: string;
  venueId: string;
  userEmail: string;
  venueName: string;
  createdAt: string;
};

type BusiestVenue = {
  venueId: string;
  name: string;
  count: number;
};

type DispatchStatus = {
  total: number;
  pending: number;
  running: number;
  done: number;
};

function getVenueName(row: CheckInRow): string {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  return venue?.name ?? "Unknown venue";
}

function truncateEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function getUserLabel(userId: string | null, emailsByUserId: Map<string, string>): string {
  if (!userId) return "anonymous";
  const email = emailsByUserId.get(userId);
  if (email) return truncateEmail(email);
  return `${userId.slice(0, 8)}...`;
}

async function getUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const emails = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (data.user?.email) emails.set(userId, data.user.email);
    })
  );

  return emails;
}

async function getDispatchStatus(): Promise<DispatchStatus> {
  const { data, error } = await supabaseAdmin
    .from("dispatch_queue")
    .select("status")
    .limit(1000);

  if (error) {
    return { total: 0, pending: 0, running: 0, done: 0 };
  }

  return (data ?? []).reduce<DispatchStatus>(
    (status, row) => {
      const value = String((row as { status?: unknown }).status ?? "").toLowerCase();
      status.total += 1;
      if (value === "pending") status.pending += 1;
      if (value === "running") status.running += 1;
      if (value === "done") status.done += 1;
      return status;
    },
    { total: 0, pending: 0, running: 0, done: 0 }
  );
}

async function getDashboardData() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [venuesResult, last24Result, recentResult, dispatchStatus] = await Promise.all([
    supabaseAdmin.from("venues").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, user_id, created_at, venues ( id, name )", { count: "exact" })
      .gte("created_at", since)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, user_id, created_at, venues ( id, name )")
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(10),
    getDispatchStatus(),
  ]);

  const dataError = venuesResult.error ?? last24Result.error ?? recentResult.error;
  if (dataError) throw new Error(`Failed to fetch admin dashboard data: ${dataError.message}`);

  const last24Rows = ((last24Result.data ?? []) as unknown[]) as CheckInRow[];
  const recentRows = ((recentResult.data ?? []) as unknown[]) as CheckInRow[];
  const emailsByUserId = await getUserEmails(recentRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)));

  const venueCounts = new Map<string, BusiestVenue>();
  last24Rows.forEach((row) => {
    const current = venueCounts.get(row.venue_id) ?? {
      venueId: row.venue_id,
      name: getVenueName(row),
      count: 0,
    };
    current.count += 1;
    venueCounts.set(row.venue_id, current);
  });

  return {
    totalVenues: venuesResult.count ?? 0,
    checkInsLast24h: last24Result.count ?? last24Rows.length,
    busiestVenues: Array.from(venueCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    recentCheckIns: recentRows.map<RecentCheckIn>((row) => ({
      id: row.id,
      venueId: row.venue_id,
      userEmail: getUserLabel(row.user_id, emailsByUserId),
      venueName: getVenueName(row),
      createdAt: row.created_at,
    })),
    dispatchStatus,
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-white/50">{label}</p>
      <p className="font-display mt-2 text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  if (adminCookie !== getAdminCookieToken()) {
    redirect("/admin/login");
  }

  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-[#0A0A0E] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="font-display text-sm uppercase tracking-[0.2em] text-[#8B6CFF]">NightVibe Admin</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight">Venue Operations Dashboard</h1>
          <p className="mt-2 text-sm text-white/50">Live venue, check-in, and dispatch health.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total venues" value={data.totalVenues} />
          <StatCard label="Check-ins last 24h" value={data.checkInsLast24h} />
          <StatCard label="Dispatches total" value={data.dispatchStatus.total} />
          <StatCard label="Dispatches pending" value={data.dispatchStatus.pending} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-lg border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="font-display font-semibold text-white">Top 5 busiest venues</h2>
              <p className="text-sm text-white/45">By check-in count in the last 24 hours.</p>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-white/45">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 text-right font-medium">Check-ins</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                <BusiestVenueRows initialVenues={data.busiestVenues} />
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="font-display font-semibold text-white">Dispatch queue</h2>
              <p className="text-sm text-white/45">Current job status counts.</p>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-white/10 text-sm">
              {[
                ["Total", data.dispatchStatus.total],
                ["Pending", data.dispatchStatus.pending],
                ["Running", data.dispatchStatus.running],
                ["Done", data.dispatchStatus.done],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#0A0A0E] p-4">
                  <dt className="text-white/45">{label}</dt>
                  <dd className="font-display mt-2 text-2xl font-bold tabular-nums text-white">{Number(value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-display font-semibold text-white">Last 10 check-ins</h2>
            <p className="text-sm text-white/45">User emails are truncated for monitoring.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-white/45">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 text-right font-medium">Time</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                <RecentCheckInRows initialCheckIns={data.recentCheckIns} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
